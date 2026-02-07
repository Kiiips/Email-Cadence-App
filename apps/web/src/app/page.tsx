'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// --- Types ---

interface CadenceStep {
  id: string;
  type: 'SEND_EMAIL' | 'WAIT';
  subject?: string;
  body?: string;
  seconds?: number;
}

interface Cadence {
  id: string;
  name: string;
  steps: CadenceStep[];
}

interface Enrollment {
  id: string;
  cadenceId: string;
  contactEmail: string;
  workflowId?: string;
  currentStepIndex?: number;
  stepsVersion?: number;
  status?: string;
  statusDetail?: string;
  steps?: CadenceStep[];
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// --- Default cadence JSON for the editor ---

const DEFAULT_CADENCE = {
  name: 'Welcome Flow',
  steps: [
    { id: '1', type: 'SEND_EMAIL', subject: 'Welcome', body: 'Hello there' },
    { id: '2', type: 'WAIT', seconds: 10 },
    { id: '3', type: 'SEND_EMAIL', subject: 'Follow up', body: 'Checking in' },
  ],
};

// --- API helpers ---

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// =============================================================================
// Main Page
// =============================================================================

export default function Home() {
  // --- Cadence state ---
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [cadenceJson, setCadenceJson] = useState(JSON.stringify(DEFAULT_CADENCE, null, 2));
  const [cadenceError, setCadenceError] = useState('');
  const [cadenceSuccess, setCadenceSuccess] = useState('');

  // --- Enrollment state ---
  const [selectedCadenceId, setSelectedCadenceId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollError, setEnrollError] = useState('');
  const [enrollSuccess, setEnrollSuccess] = useState('');
  const [enrollCountdown, setEnrollCountdown] = useState(0);
  const enrollCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const enrollSendRef = useRef<NodeJS.Timeout | null>(null);

  // --- Update cadence state ---
  const [updateEnrollmentId, setUpdateEnrollmentId] = useState('');
  const [updateStepsJson, setUpdateStepsJson] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // --- Expanded enrollment detail ---
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<string | null>(null);

  // --- API health state ---
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'down'>('checking');
  const [temporalStatus, setTemporalStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');

  // --- Polling ---
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Check API health + load cadences on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API}/health`);
        if (res.ok) {
          const data = await res.json();
          setApiStatus('ok');
          setTemporalStatus(data.temporal === 'connected' ? 'connected' : 'disconnected');
        } else {
          setApiStatus('down');
        }
      } catch {
        setApiStatus('down');
      }
    };
    checkHealth();
    const healthInterval = setInterval(checkHealth, 10_000);
    loadCadences();
    return () => clearInterval(healthInterval);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

  const loadCadences = async () => {
    try {
      const data = await apiCall<Cadence[]>('/cadences');
      setCadences(data);
    } catch {
      // API might not be running yet
    }
  };

  // --- Cadence CRUD ---

  const handleCreateCadence = async () => {
    setCadenceError('');
    setCadenceSuccess('');
    try {
      const parsed = JSON.parse(cadenceJson);
      const cadence = await apiCall<Cadence>('/cadences', {
        method: 'POST',
        body: JSON.stringify({ name: parsed.name, steps: parsed.steps }),
      });
      setCadenceSuccess(`Created cadence: ${cadence.id}`);
      setCadences((prev) => [...prev, cadence]);
      if (!selectedCadenceId) setSelectedCadenceId(cadence.id);
    } catch (e: any) {
      setCadenceError(e.message);
    }
  };

  const handleUpdateCadence = async (cadence: Cadence) => {
    setCadenceError('');
    setCadenceSuccess('');
    try {
      const parsed = JSON.parse(cadenceJson);
      const updated = await apiCall<Cadence>(`/cadences/${cadence.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: parsed.name, steps: parsed.steps }),
      });
      setCadenceSuccess(`Updated cadence: ${updated.id}`);
      setCadences((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (e: any) {
      setCadenceError(e.message);
    }
  };

  const handleDeleteCadence = async (id: string) => {
    setCadenceError('');
    setCadenceSuccess('');
    try {
      await apiCall(`/cadences/${id}`, { method: 'DELETE' });
      setCadences((prev) => prev.filter((c) => c.id !== id));
      if (selectedCadenceId === id) setSelectedCadenceId('');
    } catch (e: any) {
      setCadenceError(e.message);
    }
  };

  const loadCadenceIntoEditor = (cadence: Cadence) => {
    setCadenceJson(JSON.stringify({ name: cadence.name, steps: cadence.steps }, null, 2));
  };

  // --- Enrollment ---

  const sendEnroll = async () => {
    try {
      const enrollment = await apiCall<Enrollment>('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ cadenceId: selectedCadenceId, contactEmail }),
      });
      setEnrollSuccess(`Enrollment started: ${enrollment.id}`);
      setEnrollments((prev) => [...prev, { ...enrollment, status: 'RUNNING' }]);
      startPolling(enrollment.id);
    } catch (e: any) {
      setEnrollError(e.message);
    }
  };

  const handleEnroll = () => {
    setEnrollError('');
    setEnrollSuccess('');
    if (!selectedCadenceId || !contactEmail) {
      setEnrollError('Please select a cadence and enter an email');
      return;
    }

    setEnrollCountdown(10);
    enrollCountdownRef.current = setInterval(() => {
      setEnrollCountdown((prev) => {
        if (prev <= 1) {
          if (enrollCountdownRef.current) clearInterval(enrollCountdownRef.current);
          enrollCountdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    enrollSendRef.current = setTimeout(() => {
      setEnrollCountdown(0);
      sendEnroll();
    }, 10000);
  };

  const cancelEnroll = () => {
    if (enrollCountdownRef.current) clearInterval(enrollCountdownRef.current);
    if (enrollSendRef.current) clearTimeout(enrollSendRef.current);
    enrollCountdownRef.current = null;
    enrollSendRef.current = null;
    setEnrollCountdown(0);
    setEnrollSuccess('Enrollment cancelled');
  };

  const startPolling = useCallback((enrollmentId: string) => {
    // Clear any existing polling for this enrollment
    if (pollingRef.current[enrollmentId]) {
      clearInterval(pollingRef.current[enrollmentId]);
    }
    pollingRef.current[enrollmentId] = setInterval(async () => {
      try {
        const data = await apiCall<Enrollment>(`/enrollments/${enrollmentId}`);
        setEnrollments((prev) =>
          prev.map((e) => (e.id === enrollmentId ? { ...e, ...data } : e)),
        );
        if (data.status === 'COMPLETED') {
          clearInterval(pollingRef.current[enrollmentId]);
          delete pollingRef.current[enrollmentId];
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }, []);

  // --- Update running workflow ---

  const sendUpdate = async () => {
    try {
      const steps = JSON.parse(updateStepsJson);
      await apiCall(`/enrollments/${updateEnrollmentId}/update-cadence`, {
        method: 'POST',
        body: JSON.stringify({ steps }),
      });
      setUpdateSuccess(`Cadence updated for enrollment ${updateEnrollmentId}`);
      const data = await apiCall<Enrollment>(`/enrollments/${updateEnrollmentId}`);
      setEnrollments((prev) =>
        prev.map((e) => (e.id === updateEnrollmentId ? { ...e, ...data } : e)),
      );
    } catch (e: any) {
      setUpdateError(e.message);
    }
  };

  const handleUpdateWorkflow = () => {
    setUpdateError('');
    setUpdateSuccess('');
    if (!updateEnrollmentId) {
      setUpdateError('Please select an enrollment to update');
      return;
    }
    try {
      JSON.parse(updateStepsJson);
    } catch {
      setUpdateError('Invalid JSON');
      return;
    }

    sendUpdate();
  };

  const prefillUpdateSteps = (enrollment: Enrollment) => {
    setUpdateEnrollmentId(enrollment.id);
    if (enrollment.steps) {
      setUpdateStepsJson(JSON.stringify(enrollment.steps, null, 2));
    } else {
      // Load from the cadence
      const cadence = cadences.find((c) => c.id === enrollment.cadenceId);
      if (cadence) {
        setUpdateStepsJson(JSON.stringify(cadence.steps, null, 2));
      }
    }
  };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div>
      <h1>Email Cadence Manager</h1>

      {apiStatus === 'down' && (
        <div style={{ padding: '12px 16px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b' }}>
          <strong>API server is unreachable</strong> at {API}. Make sure the API is running (<code>npm run dev</code> from the project root).
        </div>
      )}
      {apiStatus === 'ok' && temporalStatus === 'disconnected' && (
        <div style={{ padding: '12px 16px', marginBottom: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, color: '#92400e' }}>
          <strong>Temporal server is not connected.</strong> Cadence CRUD works, but enrollments (starting/querying workflows) require Temporal running at {process.env.TEMPORAL_ADDRESS || 'localhost:7233'}.
        </div>
      )}

      <div className="grid">
        {/* ---- Left column: Cadence Editor ---- */}
        <div>
          <div className="card">
            <h2>Cadence Editor</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Edit the JSON below to define a cadence, then create or update.
            </p>
            <div className="form-group">
              <label>Cadence JSON</label>
              <textarea
                rows={14}
                value={cadenceJson}
                onChange={(e) => setCadenceJson(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateCadence}>Create Cadence</button>
              {cadences.length > 0 && (
                <button
                  style={{ background: '#6b7280' }}
                  onClick={() => {
                    const cadence = cadences.find((c) => c.id === selectedCadenceId);
                    if (cadence) handleUpdateCadence(cadence);
                  }}
                >
                  Update Selected
                </button>
              )}
            </div>
            {cadenceError && <p className="error">{cadenceError}</p>}
            {cadenceSuccess && <p className="success">{cadenceSuccess}</p>}
          </div>

          <div className="card">
            <h2>Existing Cadences</h2>
            {cadences.length === 0 ? (
              <p style={{ fontSize: 13, color: '#999' }}>No cadences yet. Create one above.</p>
            ) : (
              cadences.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '8px 12px',
                    marginBottom: 6,
                    border: selectedCadenceId === c.id ? '2px solid #0070f3' : '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: selectedCadenceId === c.id ? '#eff6ff' : 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onClick={() => {
                    setSelectedCadenceId(c.id);
                    loadCadenceIntoEditor(c);
                  }}
                >
                  <div>
                    <strong>{c.name}</strong>
                    <br />
                    <span style={{ fontSize: 12, color: '#888' }}>{c.steps.length} steps</span>
                  </div>
                  <button
                    style={{ background: '#ef4444', fontSize: 12, padding: '4px 10px' }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleDeleteCadence(c.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ---- Right column: Enrollment & Status ---- */}
        <div>
          <div className="card">
            <h2>Enroll Contact</h2>
            <div className="form-group">
              <label>Cadence</label>
              <select
                value={selectedCadenceId}
                onChange={(e) => setSelectedCadenceId(e.target.value)}
                style={{
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14,
                  width: '100%',
                }}
              >
                <option value="">-- Select a cadence --</option>
                {cadences.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Contact Email</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            {enrollCountdown > 0 ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: '3px solid #0070f3', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: '#0070f3',
                  }}>
                    {enrollCountdown}
                  </div>
                  <span style={{ fontSize: 13, color: '#555' }}>Starting in {enrollCountdown}s...</span>
                  <button onClick={cancelEnroll} style={{ background: '#ef4444', fontSize: 12, padding: '6px 14px' }}>
                    Cancel
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#0070f3', marginTop: 8 }}>
                  You can edit the cadence steps in the editor and click &quot;Update Selected&quot; before the countdown ends.
                </p>
              </div>
            ) : (
              <button onClick={handleEnroll}>Start Workflow</button>
            )}
            {enrollError && <p className="error">{enrollError}</p>}
            {enrollSuccess && <p className="success">{enrollSuccess}</p>}
          </div>

          <div className="card">
            <h2>Enrollments</h2>
            {enrollments.length === 0 ? (
              <p style={{ fontSize: 13, color: '#999' }}>No enrollments yet.</p>
            ) : (
              enrollments.map((e) => (
                <div
                  key={e.id}
                  style={{
                    padding: '10px 12px',
                    marginBottom: 8,
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{e.contactEmail}</strong>
                    <span
                      className={`status-badge ${e.status === 'RUNNING' ? 'running' : e.status === 'COMPLETED' ? 'completed' : ''}`}
                      style={e.status !== 'RUNNING' && e.status !== 'COMPLETED' ? { background: '#f3f4f6', color: '#6b7280' } : undefined}
                    >
                      {e.status || 'UNKNOWN'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    {e.steps && e.currentStepIndex != null && (
                      <div>Step {Math.min(e.currentStepIndex + 1, e.steps.length)} of {e.steps.length}</div>
                    )}
                    {(e.stepsVersion ?? 0) > 1 && (
                      <div style={{ fontSize: 12, color: '#92400e' }}>Steps updated</div>
                    )}
                    {e.statusDetail && (e.status === 'UNKNOWN' || e.status === 'TEMPORAL_DISCONNECTED') && (
                      <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>{e.statusDetail}</div>
                    )}
                  </div>
                  {e.status === 'RUNNING' && (
                    <button
                      style={{ marginTop: 6, fontSize: 12, padding: '4px 10px', background: '#f59e0b' }}
                      onClick={() => prefillUpdateSteps(e)}
                    >
                      Update Cadence
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* ---- Update running workflow ---- */}
          <div className="card">
            <h2>Update Running Workflow</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Send new steps to a running enrollment workflow via Temporal signal.
            </p>
            <div className="form-group">
              <label>Enrollment ID</label>
              <select
                value={updateEnrollmentId}
                onChange={(e) => setUpdateEnrollmentId(e.target.value)}
                style={{
                  padding: 8,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14,
                  width: '100%',
                }}
              >
                <option value="">-- Select enrollment --</option>
                {enrollments
                  .filter((e) => e.status === 'RUNNING')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} ({e.contactEmail})
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>New Steps JSON</label>
              <textarea
                rows={10}
                value={updateStepsJson}
                onChange={(e) => setUpdateStepsJson(e.target.value)}
                placeholder='[{"id":"1","type":"SEND_EMAIL","subject":"New","body":"Updated email"}]'
              />
            </div>
            <button onClick={handleUpdateWorkflow} style={{ background: '#f59e0b' }}>
              Send Update Signal
            </button>
            {updateError && <p className="error">{updateError}</p>}
            {updateSuccess && <p className="success">{updateSuccess}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
