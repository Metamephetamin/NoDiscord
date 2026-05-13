using System.Collections.Concurrent;

namespace BackNoDiscord.Observability;

public sealed class ProductionMetrics
{
    private readonly ConcurrentDictionary<string, long> _clientDiagnosticsBySurface = new(StringComparer.OrdinalIgnoreCase);
    private long _clientDiagnosticCount;
    private long _rejectedClientDiagnosticCount;

    public void RecordClientDiagnostic(ClientDiagnosticEvent diagnostic)
    {
        Interlocked.Increment(ref _clientDiagnosticCount);
        _clientDiagnosticsBySurface.AddOrUpdate(diagnostic.Surface, 1, (_, current) => current + 1);
    }

    public void RecordRejectedClientDiagnostic()
    {
        Interlocked.Increment(ref _rejectedClientDiagnosticCount);
    }

    public ProductionMetricsSnapshot Snapshot()
    {
        return new ProductionMetricsSnapshot(
            Interlocked.Read(ref _clientDiagnosticCount),
            Interlocked.Read(ref _rejectedClientDiagnosticCount),
            _clientDiagnosticsBySurface.ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase));
    }
}

public sealed record ProductionMetricsSnapshot(
    long ClientDiagnosticCount,
    long RejectedClientDiagnosticCount,
    IReadOnlyDictionary<string, long> ClientDiagnosticsBySurface);
