import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  LayoutDashboard,
  Users,
  Headphones,
  ShieldAlert,
  History,
  RefreshCw,
  UserX,
  UserCheck,
  Award,
  Radio
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function App() {
  const [tab, setTab] = useState('Overview');
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [sRes, uRes, rRes, repRes, audRes] = await Promise.all([
        fetch(`${API}/api/stats`).then((r) => r.json()),
        fetch(`${API}/api/users`).then((r) => r.json()),
        fetch(`${API}/api/rooms`).then((r) => r.json()),
        fetch(`${API}/api/reports`).then((r) => r.json()),
        fetch(`${API}/api/admin/audit`).then((r) => r.json()).catch(() => ({ auditLogs: [] }))
      ]);

      setStats(sRes);
      setUsers(uRes);
      setRooms(rRes);
      setReports(repRes);
      setAuditLogs(audRes.auditLogs || []);
      setError('');
    } catch {
      setError('Backend unreachable. Ensure backend is running on port 4000.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // Live Socket.IO connection for instant real-time data sync
    const socket = io(API, { transports: ['websocket', 'polling'] });

    socket.on('users:changed', () => load());
    socket.on('users:presence', () => load());
    socket.on('stats:changed', () => load());
    socket.on('rooms:changed', () => load());
    socket.on('reports:changed', () => load());

    // Fallback polling interval
    const timer = setInterval(load, 5000);

    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, []);

  async function resolveReport(id, status = 'resolved', notes = '') {
    try {
      await fetch(`${API}/api/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, moderatorNotes: notes })
      });
      load();
    } catch {
      alert('Failed to update report status.');
    }
  }

  async function toggleUserStatus(userId, currentStatus) {
    const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      await fetch(`${API}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      load();
    } catch {
      alert('Failed to update user status.');
    }
  }

  const menu = [
    ['Overview', LayoutDashboard],
    ['Users', Users],
    ['Rooms', Headphones],
    ['Reports', ShieldAlert],
    ['Audit Logs', History]
  ];

  return (
    <div className="shell">
      <aside>
        <h1>
          BY<span>TALK</span>
        </h1>
        <p>ADMIN CONSOLE</p>
        <nav>
          {menu.map(([label, Icon]) => (
            <button
              className={tab === label ? 'active' : ''}
              onClick={() => setTab(label)}
              key={label}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="foot">BYTALK · Management System</div>
      </aside>

      <main>
        <header>
          <div>
            <small>Aparaitech Software · Operations Portal</small>
            <h2>{tab}</h2>
          </div>
          <button className="reload" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </header>

        {error && <div className="error">{error}</div>}

        {/* 1. OVERVIEW */}
        {tab === 'Overview' && (
          <>
            <section className="metrics">
              {[
                ['Total Learners', stats.users, Users],
                ['Online Learners', stats.activeUsers, Radio, true],
                ['Pro Subscribers', stats.proSubscribers || 0, Award],
                ['Audio Rooms', stats.rooms, Headphones],
                ['Messages Exchanged', stats.messages, Users],
                ['Open Reports', stats.reports, ShieldAlert]
              ].map(([name, value, Icon, isLive]) => (
                <div className="metric" key={name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Icon size={23} />
                    {isLive && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#E8F9F0', color: '#128C50', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10B981' }} /> LIVE
                      </span>
                    )}
                  </div>
                  <p>{name}</p>
                  <strong>{value ?? '—'}</strong>
                </div>
              ))}
            </section>
            <div className="panel">
              <h3>System Overview & Operational Controls</h3>
              <p>
                Manage active BYTALK learners, live audio practice rooms, moderation reports, and immutable audit logs conforming to Aparaitech Software project requirements.
              </p>
              <p className="muted">
                <strong>Anonymity & Consent Policy:</strong> All private 1-to-1 audio sessions and rooms preserve anonymity. Real phone numbers and email addresses are never exposed to call partners.
              </p>
            </div>
          </>
        )}

        {/* 2. USERS */}
        {tab === 'Users' && (
          <div className="panel">
            <h3>Registered Learners & Account Controls</h3>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Alias / Name</th>
                    <th>Email</th>
                    <th>Country</th>
                    <th>Native Lang</th>
                    <th>Level</th>
                    <th>Subscription</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.alias || u.name}</strong>
                      </td>
                      <td>{u.email || '—'}</td>
                      <td>{u.country}</td>
                      <td>{u.nativeLanguage}</td>
                      <td>{u.level}</td>
                      <td>
                        <span
                          className="status"
                          style={{
                            background: u.subscription?.plan === 'pro' ? '#F3EEFF' : '#F1F3F7',
                            color: u.subscription?.plan === 'pro' ? '#7C3AED' : '#4B5563',
                            fontWeight: u.subscription?.plan === 'pro' ? '700' : '500'
                          }}
                        >
                          {u.subscription?.plan === 'pro' ? '★ BYTALK Pro' : 'Free Starter'}
                        </span>
                      </td>
                      <td>
                        <span
                          className="status"
                          style={{
                            background: u.status === 'suspended' ? '#FFE8E6' : u.online ? '#E8F9F0' : '#F1F3F7',
                            color: u.status === 'suspended' ? '#D92D20' : u.online ? '#128C50' : '#6B7280',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          {u.online && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#10B981' }} />}
                          {u.status === 'suspended' ? 'Suspended' : u.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="action"
                          style={{
                            backgroundColor: u.status === 'suspended' ? '#128C50' : '#D92D20',
                            padding: '6px 10px',
                            fontSize: '12px'
                          }}
                          onClick={() => toggleUserStatus(u.id, u.status)}
                        >
                          {u.status === 'suspended' ? (
                            <>
                              <UserCheck size={14} /> Reactivate
                            </>
                          ) : (
                            <>
                              <UserX size={14} /> Suspend
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. ROOMS */}
        {tab === 'Rooms' && (
          <div className="panel">
            <h3>Live Audio Room Directory</h3>
            <div className="roomlist">
              {rooms.map((r) => (
                <div className="room" key={r.id}>
                  <div className="emoji">🎙️</div>
                  <div>
                    <b>{r.name}</b>
                    <p>
                      {r.topic} · {r.level} · Capacity: {r.capacity || 50}
                    </p>
                  </div>
                  <span>{r.listeners + (r.joined || 0)} listening</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. REPORTS & SAFETY */}
        {tab === 'Reports' && (
          <div className="panel">
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ margin: 0 }}>Moderation & Safety Reports Queue</h3>
              <p style={{ margin: '6px 0 0', color: '#697891', fontSize: '13px' }}>
                🛡️ <strong>Innocent User Safeguard:</strong> Reported accounts are never penalized automatically. Review interaction context, dismiss false reports, or penalize malicious accusers.
              </p>
            </div>

            {reports.length === 0 ? (
              <p>No safety reports currently flagged.</p>
            ) : (
              reports.map((x) => {
                const targetUser = users.find((u) => u.id === x.reportedUserId);
                const reporterUser = users.find((u) => u.id === x.reporterId);
                const isUnverified = x.verificationStatus === 'unverified_interaction';
                const isDismissedAsFalse = x.status === 'dismissed_as_false';

                return (
                  <div className="room" key={x.id} style={{ alignItems: 'flex-start', padding: '16px 0', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span
                          className="status"
                          style={{
                            background: x.status === 'open' ? '#FFF4EE' : isDismissedAsFalse ? '#FFE8E6' : '#E8F9F0',
                            color: x.status === 'open' ? '#FF5226' : isDismissedAsFalse ? '#D92D20' : '#128C50',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}
                        >
                          {x.status === 'open' ? 'PENDING MODERATION' : isDismissedAsFalse ? 'REVERTED: FALSE REPORT (PENALIZED)' : 'RESOLVED / DISMISSED'}
                        </span>

                        <span
                          className="status"
                          style={{
                            background: isUnverified ? '#FEF9E7' : '#EDF5FF',
                            color: isUnverified ? '#B45309' : '#1E40AF',
                            fontSize: '11px'
                          }}
                        >
                          {isUnverified ? '⚠️ Unverified Interaction' : 'Shared Call Context Verified'}
                        </span>

                        {isDismissedAsFalse && (
                          <span className="status" style={{ background: '#FEE2E2', color: '#991B1B', fontSize: '11px', fontWeight: 'bold' }}>
                            ⚖️ Accuser Penalized
                          </span>
                        )}
                      </div>

                      <b style={{ fontSize: '15px' }}>Report Reason: "{x.reason}"</b>

                      <div style={{ margin: '8px 0', fontSize: '13px', lineHeight: '20px' }}>
                        <p style={{ margin: '2px 0' }}>
                          Reported Person (Innocent Target): <strong>{targetUser ? `${targetUser.name} (${targetUser.alias || targetUser.id})` : x.reportedUserId || 'Session'}</strong>
                          {' — '}
                          <span style={{ color: '#128C50', fontWeight: 'bold' }}>Status: Protected & Active</span>
                        </p>
                        <p style={{ margin: '2px 0', color: '#4B5563' }}>
                          Submitted By (Accuser): <strong>{reporterUser ? `${reporterUser.name} (${reporterUser.alias || reporterUser.id})` : x.reporterId || 'Anonymous'}</strong>
                          {reporterUser?.falseReportCount ? (
                            <span style={{ color: '#DC2626', fontWeight: 'bold' }}> (⚠️ {reporterUser.falseReportCount} False Report Strikes)</span>
                          ) : (
                            <span style={{ color: '#6B7280' }}> (0 prior strikes)</span>
                          )}
                        </p>
                      </div>

                      <small style={{ color: '#8894A8' }}>
                        Report ID: {x.id.slice(0, 8)}... · Reported At: {new Date(x.at).toLocaleString()}
                        {x.moderatorNotes && ` · Notes: ${x.moderatorNotes}`}
                      </small>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '12px' }}>
                      {x.status === 'open' ? (
                        <>
                          <button
                            className="action"
                            style={{ backgroundColor: '#128C50', padding: '8px 12px', fontSize: '12px' }}
                            onClick={() => resolveReport(x.id, 'resolved', 'Dismissed as minor dispute.')}
                          >
                            Dismiss Report
                          </button>
                          <button
                            className="action"
                            style={{ backgroundColor: '#D92D20', padding: '8px 12px', fontSize: '12px' }}
                            onClick={() => resolveReport(x.id, 'dismissed_as_false', 'False report confirmed. Strike added to accuser.')}
                          >
                            ⚖️ Penalize Accuser
                          </button>
                        </>
                      ) : (
                        !isDismissedAsFalse && (
                          <button
                            className="action"
                            style={{ backgroundColor: '#EF4444', padding: '6px 10px', fontSize: '11px' }}
                            onClick={() => resolveReport(x.id, 'dismissed_as_false', 'Reverted: Admitted false report. Reporter penalized.')}
                          >
                            Revert & Strike Accuser
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 5. AUDIT LOGS */}
        {tab === 'Audit Logs' && (
          <div className="panel">
            <h3>Administrative & Safety Audit Trail (Section 17 & 19)</h3>
            <p className="muted" style={{ marginBottom: '16px' }}>
              Immutable record of security events, reports, user suspensions, and data operations.
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Event Type</th>
                    <th>Target / Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan="4">No audit events recorded yet.</td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <strong>{log.actor}</strong>
                        </td>
                        <td>
                          <span
                            className="status"
                            style={{
                              background: log.eventType.includes('BLOCKED') || log.eventType.includes('REPORT')
                                ? '#FFE8E6'
                                : '#EDF5FF',
                              color: log.eventType.includes('BLOCKED') || log.eventType.includes('REPORT')
                                ? '#D92D20'
                                : '#1E40AF'
                            }}
                          >
                            {log.eventType}
                          </span>
                        </td>
                        <td>{log.target || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
