using BackNoDiscord;
using BackNoDiscord.Infrastructure;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;

LoadDotEnv();

var builder = WebApplication.CreateBuilder(args);

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

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 100L * 1024 * 1024;
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(origin => FrontendOriginPolicy.IsAllowed(origin, builder.Configuration))
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

                if (!string.IsNullOrEmpty(accessToken) &&
                    (path.StartsWithSegments("/chatHub") || path.StartsWithSegments("/voiceHub")))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
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
});
builder.Services.AddSingleton<ChannelService>();
builder.Services.AddSingleton<IClientUpdateService, ClientUpdateService>();
builder.Services.AddSingleton<CryptoService>();
builder.Services.AddSingleton<ILiveKitTokenService, LiveKitTokenService>();
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddSingleton<UploadStoragePaths>();
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
builder.Services.AddSingleton<IEmailVerificationSender, SmtpEmailVerificationSender>();
builder.Services.AddScoped<ServerInviteService>();
builder.Services.AddScoped<ServerStateService>();
builder.Services.AddScoped<FriendRequestService>();
builder.Services.AddSingleton<UserPresenceService>();
builder.Services.AddSingleton<ISpeechPunctuationService, SpeechPunctuationService>();
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

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;";
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
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(chatFilesDirectory),
    RequestPath = "/chat-files",
    OnPrepareResponse = context =>
    {
        context.Context.Response.Headers["Cache-Control"] = "public,max-age=31536000,immutable";

        var origin = context.Context.Request.Headers.Origin.ToString();
        if (!FrontendOriginPolicy.IsAllowed(origin, app.Configuration))
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(origin))
        {
            context.Context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Context.Response.Headers["Vary"] = "Origin";
            context.Context.Response.Headers["Access-Control-Allow-Credentials"] = "true";
        }
    }
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.UseAuthentication();
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
    var currentDirectory = Directory.GetCurrentDirectory();
    var envFile = EnumerateDotEnvPaths(currentDirectory).FirstOrDefault(File.Exists);
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
