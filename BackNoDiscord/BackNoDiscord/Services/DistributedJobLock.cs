using System.Collections.Concurrent;
using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public interface IDistributedJobLock
{
    Task<IAsyncDisposable?> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken);
}

public sealed class DistributedJobLock : IDistributedJobLock
{
    private static readonly ConcurrentDictionary<long, byte> InMemoryLocks = new();

    private readonly AppDbContext _context;
    private readonly ILogger<DistributedJobLock> _logger;

    public DistributedJobLock(AppDbContext context, ILogger<DistributedJobLock> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<IAsyncDisposable?> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested || string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var lockKey = CreateLockKey(key);
        if (!IsPostgresProvider())
        {
            return InMemoryLocks.TryAdd(lockKey, 0) ? new InMemoryLockHandle(lockKey) : null;
        }

        try
        {
            var connection = _context.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
            {
                await connection.OpenAsync(cancellationToken);
            }

            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT pg_try_advisory_lock(@lock_key)";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "lock_key";
            parameter.Value = lockKey;
            command.Parameters.Add(parameter);

            var result = await command.ExecuteScalarAsync(cancellationToken);
            var acquired = result is bool boolResult && boolResult;
            return acquired ? new PostgresAdvisoryLockHandle(connection, lockKey, _logger) : null;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return null;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Could not acquire distributed job lock {LockKey}.", key);
            return null;
        }
    }

    private bool IsPostgresProvider() =>
        string.Equals(_context.Database.ProviderName, "Npgsql.EntityFrameworkCore.PostgreSQL", StringComparison.Ordinal);

    private static long CreateLockKey(string key)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return BitConverter.ToInt64(hash, 0);
    }

    private sealed class InMemoryLockHandle : IAsyncDisposable
    {
        private readonly long _key;
        private bool _disposed;

        public InMemoryLockHandle(long key)
        {
            _key = key;
        }

        public ValueTask DisposeAsync()
        {
            if (!_disposed)
            {
                InMemoryLocks.TryRemove(_key, out _);
                _disposed = true;
            }

            return ValueTask.CompletedTask;
        }
    }

    private sealed class PostgresAdvisoryLockHandle : IAsyncDisposable
    {
        private readonly System.Data.Common.DbConnection _connection;
        private readonly long _key;
        private readonly ILogger _logger;
        private bool _disposed;

        public PostgresAdvisoryLockHandle(System.Data.Common.DbConnection connection, long key, ILogger logger)
        {
            _connection = connection;
            _key = key;
            _logger = logger;
        }

        public async ValueTask DisposeAsync()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            try
            {
                await using var command = _connection.CreateCommand();
                command.CommandText = "SELECT pg_advisory_unlock(@lock_key)";
                var parameter = command.CreateParameter();
                parameter.ParameterName = "lock_key";
                parameter.Value = _key;
                command.Parameters.Add(parameter);
                await command.ExecuteScalarAsync();
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception, "Could not release distributed job lock.");
            }
        }
    }
}
