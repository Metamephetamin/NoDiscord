using BackNoDiscord;
using BackNoDiscord.Infrastructure;
using BackNoDiscord.Observability;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using System.Net;
using System.Text;
using System.Threading.RateLimiting;

LoadDotEnv();

var builder = WebApplication.CreateBuilder(args);
builder.Logging.Configure(options =>
{
    options.ActivityTrackingOptions =
        ActivityTrackingOptions.TraceId |
        ActivityTrackingOptions.SpanId |
        ActivityTrackingOptions.ParentId;
});
builder.Logging.AddFilter("Microsoft.AspNetCore.HttpLogging", LogLevel.Warning);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured. Use .env, environment variables, or appsettings.");
}

var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException("Jwt:Key is not configured. Use .env, environment variables, or appsettings.");
}

if (jwtKey.Length < 32)
{
    throw new InvalidOperationException("Jwt:Key must be at least 32 characters long.");
}

const string MediaAccessTokenCookieName = "tend_access_token";
const long MaxChatFileUploadBytes = 500L * 1024 * 1024;
const long MultipartRequestOverheadBytes = 1L * 1024 * 1024;
var maxChatFileUploadRequestBytes = checked(
    GetConfiguredPositiveLong(builder.Configuration, "ChatFiles:MaxFileSizeBytes", MaxChatFileUploadBytes) +
    MultipartRequestOverheadBytes);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = maxChatFileUploadRequestBytes;
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = maxChatFileUploadRequestBytes;
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(origin => FrontendOriginPolicy.IsAllowed(
                  origin,
                  builder.Configuration,
                  builder.Environment.IsDevelopment()))
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
    options.KnownProxies.Add(IPAddress.Loopback);
    options.KnownProxies.Add(IPAddress.IPv6Loopback);

    foreach (var proxy in GetConfiguredKnownProxies(builder.Configuration))
    {
        options.KnownProxies.Add(proxy);
    }
});

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.Zero
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                var origin = context.Request.Headers.Origin.ToString();

                if (HubQueryTokenPolicy.CanAcceptQueryToken(
                        accessToken,
                        path,
                        origin,
                        builder.Configuration,
                        builder.Environment.IsDevelopment()))
                {
                    context.Token = accessToken;
                }
                else if (HubCookieTokenPolicy.CanAcceptCookieToken(
                             path,
                             origin,
                             builder.Configuration,
                             builder.Environment.IsDevelopment()) &&
                         context.Request.Cookies.TryGetValue(MediaAccessTokenCookieName, out var hubAccessToken) &&
                         !string.IsNullOrWhiteSpace(hubAccessToken))
                {
                    context.Token = hubAccessToken;
                }
                else if (CanAcceptMediaCookieToken(context.Request, path) &&
                         context.Request.Cookies.TryGetValue(MediaAccessTokenCookieName, out var mediaAccessToken) &&
                         !string.IsNullOrWhiteSpace(mediaAccessToken))
                {
                    context.Token = mediaAccessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, cancellationToken) =>
    {
        var httpContext = context.HttpContext;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            httpContext.Response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString("F0");
        }

        var logger = httpContext.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("BackNoDiscord.RateLimiting");
        logger.LogWarning(
            "Rate limit rejected {Method} {Path} from {RemoteIp} status {StatusCode} correlationId={CorrelationId}",
            httpContext.Request.Method,
            httpContext.Request.Path.Value,
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            StatusCodes.Status429TooManyRequests,
            httpContext.TraceIdentifier);

        return ValueTask.CompletedTask;
    };
    options.AddPolicy("auth", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var path = context.Request.Path.Value ?? "/auth";

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"{path}:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
    options.AddPolicy("email-send", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"email-send:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 6,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
    options.AddPolicy("email-verify", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"email-verify:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 12,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
    options.AddPolicy("qr-login-poll", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"qr-login-poll:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 80,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
    options.AddPolicy("media-render", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"media-render:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
    options.AddPolicy("chat-upload", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"chat-upload:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
    options.AddPolicy("client-diagnostics", context =>
    {
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"client-diagnostics:{remoteIp}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});
builder.Services.AddSingleton<ChannelService>();
builder.Services.AddSingleton<ProductionMetrics>();
builder.Services.AddScoped<ProductionHealthService>();
builder.Services.AddSingleton<IClientUpdateService, ClientUpdateService>();
builder.Services.AddSingleton<CryptoService>();
builder.Services.AddSingleton<ILiveKitTokenService, LiveKitTokenService>();
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddSingleton<UploadStoragePaths>();
builder.Services.AddSingleton<IChatFileUploadStorageMetrics, LocalChatFileUploadStorageMetrics>();
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
builder.Services.AddSingleton<IEmailVerificationSender, SmtpEmailVerificationSender>();
builder.Services.AddScoped<ServerInviteService>();
builder.Services.AddScoped<ServerStateService>();
builder.Services.AddScoped<ChatFileAccessService>();
builder.Services.AddScoped<UserStorageQuotaService>();
builder.Services.AddScoped<ChatFileCleanupService>();
builder.Services.AddScoped<ChatFileMetadataRepairService>();
builder.Services.AddScoped<MessageSearchService>();
builder.Services.AddScoped<MessageDeduplicationService>();
builder.Services.AddScoped<ChatReadStateService>();
builder.Services.AddScoped<UserSessionService>();
builder.Services.AddScoped<AccountBanService>();
builder.Services.AddScoped<AdminSecurityOverviewService>();
builder.Services.AddScoped<ModerationService>();
builder.Services.AddSingleton<ChatSpamBurstLimiter>();
builder.Services.AddSingleton<AbuseAutoBanService>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<FriendRequestService>();
builder.Services.AddScoped<UserBlockService>();
builder.Services.AddHostedService<ChatFileCleanupHostedService>();
builder.Services.AddHostedService<ChatFileMetadataRepairHostedService>();
builder.Services.AddSingleton<UserPresenceService>();
builder.Services.AddSingleton<ISpeechPunctuationService, SpeechPunctuationService>();
builder.Services.AddSingleton<ITextTranslationService, TextTranslationService>();
builder.Services.AddHttpClient();
builder.Services.AddControllers();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 4 * 1024 * 1024;
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
})
.AddMessagePackProtocol();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

await DatabaseSchemaInitializer.InitializeAsync(app.Services);

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "BackNoDiscord v1");
        c.RoutePrefix = "swagger";
    });
}
else
{
    app.UseHsts();
}

app.UseForwardedHeaders();
app.UseMiddleware<RequestCorrelationMiddleware>();

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = BuildContentSecurityPolicy(app.Environment.IsDevelopment(), app.Configuration);
    context.Response.Headers["Permissions-Policy"] =
        "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=(), serial=()";

    await next();
});

var uploadStoragePaths = app.Services.GetRequiredService<UploadStoragePaths>();
var avatarsDirectory = uploadStoragePaths.ResolveDirectory("avatars");
var profileBackgroundsDirectory = uploadStoragePaths.ResolveDirectory("profile-backgrounds");
var serverIconsDirectory = uploadStoragePaths.ResolveDirectory("server-icons");
var chatFilesDirectory = uploadStoragePaths.ResolveDirectory("chat-files");

Directory.CreateDirectory(avatarsDirectory);
Directory.CreateDirectory(profileBackgroundsDirectory);
Directory.CreateDirectory(serverIconsDirectory);
Directory.CreateDirectory(chatFilesDirectory);

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(avatarsDirectory),
    RequestPath = "/avatars",
    OnPrepareResponse = context =>
    {
        context.Context.Response.Headers["Cache-Control"] = "public,max-age=31536000,immutable";
    }
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(profileBackgroundsDirectory),
    RequestPath = "/profile-backgrounds",
    OnPrepareResponse = context =>
    {
        context.Context.Response.Headers["Cache-Control"] = "public,max-age=31536000,immutable";
    }
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(serverIconsDirectory),
    RequestPath = "/server-icons",
    OnPrepareResponse = context =>
    {
        context.Context.Response.Headers["Cache-Control"] = "public,max-age=31536000,immutable";
    }
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    var userId = AccountBanService.GetUserId(context.User);
    if (!userId.HasValue)
    {
        await next();
        return;
    }

    var path = context.Request.Path;
    if (!path.StartsWithSegments("/api") &&
        !path.StartsWithSegments("/chatHub") &&
        !path.StartsWithSegments("/voiceHub"))
    {
        await next();
        return;
    }

    var accountBanService = context.RequestServices.GetRequiredService<AccountBanService>();
    if (await accountBanService.IsUserBannedAsync(userId.Value, context.RequestAborted))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsJsonAsync(new
        {
            code = "account_banned",
            message = "Аккаунт заблокирован. Доступ к приложению закрыт."
        });
        return;
    }

    await next();
});
app.Use(async (context, next) =>
{
    var authorization = context.Request.Headers.Authorization.ToString();
    if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        var token = authorization["Bearer ".Length..].Trim();
        if (!string.IsNullOrWhiteSpace(token))
        {
            context.Response.OnStarting(() =>
            {
                if (context.User.Identity?.IsAuthenticated == true)
                {
                    AppendMediaAccessCookie(context, MediaAccessTokenCookieName, token);
                }

                return Task.CompletedTask;
            });
        }
    }

    await next();
});
app.UseAuthorization();

app.MapGet("/api/ping", () => Results.Ok(new { status = "ok" }))
   .RequireCors("AllowFrontend");

app.MapHub<ChatHub>("/chatHub").RequireAuthorization();
app.MapHub<VoiceHub>("/voiceHub").RequireAuthorization();
app.MapControllers();
app.MapFallback(async context =>
{
    if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var requestPath = context.Request.Path;
    if (requestPath.StartsWithSegments("/api") ||
        requestPath.StartsWithSegments("/chatHub") ||
        requestPath.StartsWithSegments("/voiceHub") ||
        requestPath.StartsWithSegments("/swagger") ||
        requestPath.StartsWithSegments("/avatars") ||
        requestPath.StartsWithSegments("/profile-backgrounds") ||
        requestPath.StartsWithSegments("/chat-files") ||
        requestPath.StartsWithSegments("/server-icons"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var webRootPath = app.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    var indexFilePath = Path.Combine(webRootPath, "index.html");

    if (!File.Exists(indexFilePath))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    context.Response.ContentType = "text/html; charset=utf-8";
    await context.Response.SendFileAsync(indexFilePath);
});

app.Run();

static void LoadDotEnv()
{
    var searchRoots = new[]
    {
        Directory.GetCurrentDirectory(),
        AppContext.BaseDirectory
    }
        .Where(root => !string.IsNullOrWhiteSpace(root))
        .Select(root => Path.GetFullPath(root))
        .Distinct(StringComparer.OrdinalIgnoreCase);

    var envFile = searchRoots
        .SelectMany(EnumerateDotEnvPaths)
        .FirstOrDefault(File.Exists);
    if (string.IsNullOrWhiteSpace(envFile))
    {
        return;
    }

    foreach (var rawLine in File.ReadAllLines(envFile))
    {
        var line = rawLine.Trim();
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
        {
            continue;
        }

        var separatorIndex = line.IndexOf('=');
        if (separatorIndex <= 0)
        {
            continue;
        }

        var key = line[..separatorIndex].Trim();
        var value = line[(separatorIndex + 1)..].Trim().Trim('"');

        if (string.IsNullOrWhiteSpace(key) || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key)))
        {
            continue;
        }

        Environment.SetEnvironmentVariable(key, value);
    }
}

static IEnumerable<string> EnumerateDotEnvPaths(string startDirectory)
{
    var directory = new DirectoryInfo(startDirectory);
    while (directory is not null)
    {
        yield return Path.Combine(directory.FullName, ".env");
        directory = directory.Parent;
    }
}

static long GetConfiguredPositiveLong(IConfiguration configuration, string key, long fallback)
{
    return long.TryParse(configuration[key], out var configured) && configured > 0
        ? configured
        : fallback;
}

static IReadOnlyCollection<IPAddress> GetConfiguredKnownProxies(IConfiguration configuration)
{
    var proxies = new List<IPAddress>();
    foreach (var rawProxy in ReadSeparatedValues(configuration["ForwardedHeaders:KnownProxies"])
                 .Concat(ReadSeparatedValues(configuration["ND_KNOWN_PROXIES"])))
    {
        if (IPAddress.TryParse(rawProxy, out var proxy))
        {
            proxies.Add(proxy);
        }
    }

    return proxies;
}

static string BuildContentSecurityPolicy(bool isDevelopment, IConfiguration configuration)
{
    if (isDevelopment)
    {
        return "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;";
    }

    var connectSources = new SortedSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "'self'"
    };

    foreach (var origin in FrontendOriginPolicy.GetConfiguredOrigins(configuration))
    {
        AddSecureCspOrigin(connectSources, origin);
    }

    AddSecureCspOrigin(connectSources, configuration["ND_API_URL"]);
    AddSecureCspOrigin(connectSources, configuration["ND_PUBLIC_APP_URL"]);
    AddSecureCspOrigin(connectSources, configuration["ND_LIVEKIT_URL"]);
    AddSecureCspOrigin(connectSources, configuration["LiveKit:Url"]);

    return "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
           "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://mt0.google.com https://mt1.google.com https://mt2.google.com https://mt3.google.com; " +
           "media-src 'self' blob:; font-src 'self' data:; " +
           $"connect-src {string.Join(' ', connectSources)}; " +
           "worker-src 'self' blob:; form-action 'self'; upgrade-insecure-requests;";
}

static void AddSecureCspOrigin(ISet<string> target, string? value)
{
    if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || string.IsNullOrWhiteSpace(uri.Host))
    {
        return;
    }

    if (!uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
        !uri.Scheme.Equals("wss", StringComparison.OrdinalIgnoreCase))
    {
        return;
    }

    var builder = new UriBuilder(uri.Scheme, uri.Host)
    {
        Port = uri.IsDefaultPort ? -1 : uri.Port
    };
    target.Add(builder.Uri.GetLeftPart(UriPartial.Authority));
}

static IEnumerable<string> ReadSeparatedValues(string? value)
{
    return string.IsNullOrWhiteSpace(value)
        ? []
        : value.Split([',', ';', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

static bool CanAcceptMediaCookieToken(HttpRequest request, PathString path)
{
    if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method))
    {
        return false;
    }

    return path.StartsWithSegments("/chat-files") ||
           path.StartsWithSegments("/api/media");
}

static void AppendMediaAccessCookie(HttpContext context, string cookieName, string token)
{
    context.Response.Cookies.Append(cookieName, token, new CookieOptions
    {
        HttpOnly = true,
        Secure = context.Request.IsHttps,
        SameSite = context.Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
        Path = "/",
        MaxAge = TimeSpan.FromMinutes(20)
    });
}
