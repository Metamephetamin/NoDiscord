namespace BackNoDiscord.Infrastructure;

public sealed class UploadStoragePaths
{
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public UploadStoragePaths(IConfiguration configuration, IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _environment = environment;
    }

    public string ResolveDirectory(string directoryName)
    {
        var normalizedName = string.IsNullOrWhiteSpace(directoryName)
            ? string.Empty
            : directoryName.Trim().Trim('/', '\\');

        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            throw new InvalidOperationException("A storage directory name is required.");
        }

        var storageRoot = _configuration["Storage:Root"];
        if (string.IsNullOrWhiteSpace(storageRoot))
        {
            storageRoot = _configuration["ND_STORAGE_ROOT"];
        }

        if (string.IsNullOrWhiteSpace(storageRoot))
        {
            var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            return Path.Combine(webRoot, normalizedName);
        }

        return Path.Combine(storageRoot, normalizedName);
    }
}
