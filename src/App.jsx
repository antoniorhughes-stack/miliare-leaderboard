// src/App.jsx
import { useState, useEffect, useMemo } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc, setDoc, getDoc,
  collection, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ── Admin credentials — change these to your own before deploying ─────────────
const ADMIN_EMAIL    = "admin@miliaregroup.com";
const ADMIN_PASSWORD = "ChangeMe123!";

// ── Stat definitions — funnel order ──────────────────────────────────────────
const STATS = [
  { key: "contacts",     label: "Contacts Made" },
  { key: "appts_set",    label: "Appts Set" },
  { key: "appts_ran",    label: "Appts Ran" },
  { key: "applications", label: "Applications" },
  { key: "recruits",     label: "Recruits" },
  { key: "fsm",          label: "Fast Start Mtgs Ran" },
  { key: "referrals",    label: "Referrals / New Prospects" },
];

const DEFAULT_STAT = "appts_ran";
const PERIODS      = ["Daily", "Weekly", "Monthly", "Annual"];

function today() { return new Date().toISOString().slice(0, 10); }
function weekOf(d) {
  const dt = new Date(d + "T00:00:00");
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(dt.setDate(diff)).toISOString().slice(0, 10);
}
function monthOf(d) { return d.slice(0, 7); }
function yearOf(d)  { return d.slice(0, 4); }

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser,  setAuthUser]  = useState(undefined);
  const [profile,   setProfile]   = useState(null);
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [users,     setUsers]     = useState({});
  const [entries,   setEntries]   = useState([]);
  const [view,      setView]      = useState("login");
  const [loading,   setLoading]   = useState(true);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setProfile({ id: user.uid, ...snap.data() });
          setView("board");
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
        setView("login");
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Live Firestore listeners
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      const map = {};
      snap.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
      setUsers(map);
    });
    const unsubEntries = onSnapshot(
      query(collection(db, "entries"), orderBy("date", "desc")),
      snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubUsers(); unsubEntries(); };
  }, []);

  // Auth actions
  const handleRegister = async ({ email, password, first, last, phone, smd }) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const userDoc = { first, last, email, phone, smd };
    await setDoc(doc(db, "users", cred.user.uid), userDoc);
    setProfile({ id: cred.user.uid, ...userDoc });
    setView("board");
  };

  const handleLogin = async (email, password) => {
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setProfile(null);
      setLoading(false);
      setView("admin");
      return;
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const handleLogout = async () => {
    if (isAdmin) { setIsAdmin(false); setView("login"); return; }
    await signOut(auth);
    setView("login");
  };

  const handleReport = async (statData) => {
    await addDoc(collection(db, "entries"), { userId: authUser.uid, date: today(), ...statData });
    setView("board");
  };

  // Admin Firestore actions
  const adminUpdateUser  = async (uid, data)  => { await updateDoc(doc(db, "users", uid), data); };
  const adminUpdateEntry = async (eid, data)  => { await updateDoc(doc(db, "entries", eid), data); };
  const adminDeleteEntry = async (eid)        => { await deleteDoc(doc(db, "entries", eid)); };
  const adminDeleteUser  = async (uid)        => {
    await deleteDoc(doc(db, "users", uid));
    const toDelete = entries.filter(e => e.userId === uid);
    await Promise.all(toDelete.map(e => deleteDoc(doc(db, "entries", e.id))));
  };

  if (loading || authUser === undefined) return <Loader />;

  const currentUser = isAdmin ? null : profile;

  return (
    <div style={css.root}>
      <div style={css.app}>
        <Header user={currentUser} isAdmin={isAdmin} onNav={setView} onLogout={handleLogout} />
        {view === "login"    && <LoginView    onLogin={handleLogin} onRegister={() => setView("register")} />}
        {view === "register" && <RegisterView onSave={handleRegister} onBack={() => setView("login")} />}
        {view === "report"   && <ReportView   user={currentUser} entries={entries} onSave={handleReport} onBack={() => setView("board")} />}
        {view === "board"    && <BoardView    users={users} entries={entries} currentUser={currentUser} isAdmin={isAdmin} onReport={() => setView("report")} onAdmin={() => setView("admin")} />}
        {view === "admin" && isAdmin && (
          <AdminView
            users={users} entries={entries}
            onUpdateUser={adminUpdateUser}
            onUpdateEntry={adminUpdateEntry}
            onDeleteEntry={adminDeleteEntry}
            onDeleteUser={adminDeleteUser}
          />
        )}
      </div>
    </div>
  );
}

// ── Loader ────────────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ ...css.root, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "0.1em" }}>THE MILIARE GROUP</div>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0f172a", opacity: 0.4 }} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ user, isAdmin, onNav, onLogout }) {
  return (
    <header style={css.header}>
      <div style={css.headerInner}>
        <div>
          <div style={css.headerBrand}>THE MILIARE GROUP</div>
          <div style={css.headerSub}>Performance Leaderboard</div>
        </div>
        {(user || isAdmin) && (
          <div style={css.headerRight}>
            {isAdmin ? (
              <>
                <span style={css.adminBadge}>Admin</span>
                <button style={css.navBtn} onClick={() => onNav("admin")}>Admin Panel</button>
                <button style={css.navBtn} onClick={() => onNav("board")}>Leaderboard</button>
              </>
            ) : (
              <>
                <button style={css.navBtn} onClick={() => onNav("board")}>Leaderboard</button>
                <button style={css.navBtn} onClick={() => onNav("report")}>Log Today</button>
              </>
            )}
            <button style={{ ...css.navBtn, color: "#64748b" }} onClick={onLogout}>Sign Out</button>
          </div>
        )}
      </div>
    </header>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginView({ onLogin, onRegister }) {
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [err,   setErr]   = useState("");
  const [busy,  setBusy]  = useState(false);

  const submit = async () => {
    if (!email || !pass) return setErr("Please enter your email and password.");
    setBusy(true);
    try { await onLogin(email, pass); }
    catch { setErr("Email or password incorrect."); }
    finally { setBusy(false); }
  };

  return (
    <div style={css.card}>
      <h2 style={css.cardTitle}>Sign In</h2>
      {err && <div style={css.error}>{err}</div>}
      <Field label="Email"    value={email} onChange={setEmail} type="email" />
      <Field label="Password" value={pass}  onChange={setPass}  type="password" />
      <Btn onClick={submit} disabled={busy}>{busy ? "Signing in…" : "Sign In"}</Btn>
      <p style={css.switchLink}>New to the team?{" "}<span style={css.link} onClick={onRegister}>Create account</span></p>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function RegisterView({ onSave, onBack }) {
  const [f,    setF]   = useState({ first:"", last:"", email:"", phone:"", smd:"", password:"", confirm:"" });
  const [err,  setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.first || !f.last || !f.email || !f.phone || !f.smd || !f.password) return setErr("All fields are required.");
    if (f.password !== f.confirm) return setErr("Passwords do not match.");
    if (f.password.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try { await onSave(f); }
    catch (e) { setErr(e.code === "auth/email-already-in-use" ? "An account with that email already exists." : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <div style={css.card}>
      <button style={css.backBtn} onClick={onBack}>← Back</button>
      <h2 style={css.cardTitle}>Create Account</h2>
      {err && <div style={css.error}>{err}</div>}
      <div style={css.row2}>
        <Field label="First Name" value={f.first} onChange={v => upd("first", v)} />
        <Field label="Last Name"  value={f.last}  onChange={v => upd("last", v)} />
      </div>
      <Field label="Email"            value={f.email}    onChange={v => upd("email", v)}    type="email" />
      <Field label="Phone Number"     value={f.phone}    onChange={v => upd("phone", v)}    type="tel" />
      <Field label="Upline SMD"       value={f.smd}      onChange={v => upd("smd", v)}      placeholder="e.g. Antonio Hughes" />
      <Field label="Password"         value={f.password} onChange={v => upd("password", v)} type="password" />
      <Field label="Confirm Password" value={f.confirm}  onChange={v => upd("confirm", v)}  type="password" />
      <Btn onClick={submit} disabled={busy}>{busy ? "Creating account…" : "Create Account"}</Btn>
    </div>
  );
}

// ── Daily Report ──────────────────────────────────────────────────────────────
function ReportView({ user, entries, onSave, onBack }) {
  const todayStr     = today();
  const alreadyFiled = entries.some(e => e.userId === user.id && e.date === todayStr);
  const [vals, setVals] = useState(() => Object.fromEntries(STATS.map(s => [s.key, ""])));
  const [busy, setBusy] = useState(false);

  const setVal = (k, v) => { if (v === "" || (/^\d+$/.test(v) && +v >= 0)) setVals(p => ({ ...p, [k]: v })); };

  const submit = async () => {
    setBusy(true);
    await onSave(Object.fromEntries(STATS.map(s => [s.key, parseInt(vals[s.key]) || 0])));
    setBusy(false);
  };

  if (alreadyFiled) return (
    <div style={css.card}>
      <button style={css.backBtn} onClick={onBack}>← Back</button>
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={css.checkCircle}>✓</div>
        <h3 style={{ margin: "12px 0 6px", fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20 }}>Already submitted today</h3>
        <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>Your numbers for {todayStr} are locked in.</p>
        <Btn onClick={onBack} style={{ marginTop: 24 }}>View Leaderboard</Btn>
      </div>
    </div>
  );

  return (
    <div style={css.card}>
      <button style={css.backBtn} onClick={onBack}>← Back</button>
      <h2 style={css.cardTitle}>Log Today's Activity</h2>
      <div style={css.dateTag}>{todayStr}</div>
      <div style={{ fontSize: 14, color: "#475569", marginBottom: 20 }}>Agent: <strong>{user.first} {user.last}</strong></div>
      <div style={css.reportGrid}>
        {STATS.map(s => (
          <div key={s.key}>
            <label style={css.reportLabel}>{s.label}</label>
            <input style={css.reportInput} type="number" min="0" value={vals[s.key]} onChange={e => setVal(s.key, e.target.value)} placeholder="0" />
          </div>
        ))}
      </div>
      <Btn onClick={submit} disabled={busy} style={{ marginTop: 12 }}>{busy ? "Saving…" : "Submit & Lock"}</Btn>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function BoardView({ users, entries, currentUser, isAdmin, onReport, onAdmin }) {
  const [period,  setPeriod]  = useState("Monthly");
  const [statKey, setStatKey] = useState(DEFAULT_STAT);
  const todayStr = today();

  const periodKey = (date) => {
    if (period === "Daily")   return date;
    if (period === "Weekly")  return weekOf(date);
    if (period === "Monthly") return monthOf(date);
    return yearOf(date);
  };
  const currentPeriod = periodKey(todayStr);

  const aggregated = useMemo(() => {
    const map = {};
    for (const e of entries) {
      if (periodKey(e.date) !== currentPeriod) continue;
      if (!map[e.userId]) map[e.userId] = Object.fromEntries(STATS.map(s => [s.key, 0]));
      for (const s of STATS) map[e.userId][s.key] += e[s.key] || 0;
    }
    return map;
  }, [entries, period, currentPeriod]);

  const rows = useMemo(() =>
    Object.entries(aggregated)
      .map(([uid, totals]) => ({ uid, totals, user: users[uid] }))
      .filter(r => r.user)
      .sort((a, b) => b.totals[statKey] - a.totals[statKey]),
  [aggregated, statKey, users]);

  const statLabel  = STATS.find(s => s.key === statKey)?.label || statKey;
  const todayFiled = currentUser && entries.some(e => e.userId === currentUser.id && e.date === todayStr);
  const GOLD = 15;

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={css.controlBar}>
        <div>
          <div style={css.filterLabel}>Period</div>
          <div style={css.pills}>
            {PERIODS.map(p => <button key={p} style={{ ...css.pill, ...(period === p ? css.pillOn : {}) }} onClick={() => setPeriod(p)}>{p}</button>)}
          </div>
        </div>
        <div>
          <div style={css.filterLabel}>Stat</div>
          <div style={css.pills}>
            {STATS.map(s => <button key={s.key} style={{ ...css.pill, ...(statKey === s.key ? css.pillOn : {}) }} onClick={() => setStatKey(s.key)}>{s.label}</button>)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, fontWeight: 700 }}>{period} Rankings</span>
        <span style={{ fontSize: 13, color: "#64748b" }}>{statLabel}</span>
      </div>

      {statKey === "appts_ran" && period === "Monthly" && <div style={css.goldNote}>⭐ Gold star = 15+ Appts Ran this month</div>}

      {currentUser && !todayFiled && (
        <div style={css.logPrompt}>
          <span>You haven't logged today's activity yet.</span>
          <button style={css.logBtn} onClick={onReport}>Log Now →</button>
        </div>
      )}

      {rows.length === 0
        ? <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 14 }}>No activity logged for this period yet.</div>
        : (
          <div style={css.table}>
            <div style={css.tableHead}>
              <span style={{ width: 36 }}>#</span>
              <span style={{ flex: 1 }}>Agent</span>
              <span style={{ width: 80, textAlign: "right" }}>{statLabel}</span>
            </div>
            {rows.map((row, i) => {
              const isMe  = currentUser && row.uid === currentUser.id;
              const gold  = period === "Monthly" && (aggregated[row.uid]?.appts_ran || 0) >= GOLD;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div key={row.uid} style={{ ...css.tableRow, ...(i === 0 ? { background: "#fffbeb" } : {}), ...(isMe ? { background: "#f0fdf4" } : {}) }}>
                  <span style={{ width: 36, fontWeight: 700, color: i < 3 ? "#0f172a" : "#94a3b8", fontSize: i < 3 ? 16 : 13 }}>{medal || `${i + 1}`}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{row.user.first} {row.user.last}</span>
                    {gold && <span style={{ marginLeft: 5 }}>⭐</span>}
                    {isMe && <span style={css.meBadge}>You</span>}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>SMD: {row.user.smd}</div>
                  </span>
                  <span style={css.statNum}>{row.totals[statKey].toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )
      }

      {currentUser && aggregated[currentUser.id] && (
        <div style={css.mySummary}>
          <div style={css.filterLabel}>Your {period} Totals</div>
          <div style={css.summaryGrid}>
            {STATS.map(s => (
              <div key={s.key} style={{ ...css.summaryCell, ...(s.key === statKey ? css.summaryCellOn : {}) }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{(aggregated[currentUser.id][s.key] || 0).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 3, lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminView({ users, entries, onUpdateUser, onUpdateEntry, onDeleteEntry, onDeleteUser }) {
  const [tab,          setTab]          = useState("accounts");
  const [editingUser,  setEditingUser]  = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [filterUid,    setFilterUid]    = useState("all");
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [saved,        setSaved]        = useState("");

  const flash = (msg) => { setSaved(msg); setTimeout(() => setSaved(""), 2500); };

  const UserEditor = ({ user, onClose }) => {
    const [f, setF] = useState({ first: user.first, last: user.last, email: user.email, phone: user.phone, smd: user.smd });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
    return (
      <div style={css.modal}>
        <div style={css.modalBox}>
          <div style={css.modalHeader}><span style={css.modalTitle}>Edit Account</span><button style={css.modalClose} onClick={onClose}>✕</button></div>
          <div style={css.row2}>
            <Field label="First Name" value={f.first} onChange={v => upd("first", v)} />
            <Field label="Last Name"  value={f.last}  onChange={v => upd("last", v)} />
          </div>
          <Field label="Email"      value={f.email} onChange={v => upd("email", v)} type="email" />
          <Field label="Phone"      value={f.phone} onChange={v => upd("phone", v)} type="tel" />
          <Field label="Upline SMD" value={f.smd}   onChange={v => upd("smd", v)} />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn onClick={async () => { await onUpdateUser(user.id, f); flash("Account updated."); onClose(); }} style={{ flex: 1, marginTop: 0 }}>Save Changes</Btn>
            <button onClick={onClose} style={{ ...css.cancelBtn, flex: 1 }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const EntryEditor = ({ entry, userName, onClose }) => {
    const [vals, setVals] = useState(Object.fromEntries(STATS.map(s => [s.key, entry[s.key] ?? 0])));
    const [date, setDate] = useState(entry.date);
    const setVal = (k, v) => { if (v === "" || (/^\d+$/.test(v) && +v >= 0)) setVals(p => ({ ...p, [k]: v })); };
    return (
      <div style={css.modal}>
        <div style={css.modalBox}>
          <div style={css.modalHeader}><span style={css.modalTitle}>Edit Entry — {userName}</span><button style={css.modalClose} onClick={onClose}>✕</button></div>
          <Field label="Date (YYYY-MM-DD)" value={date} onChange={setDate} />
          <div style={css.reportGrid}>
            {STATS.map(s => (
              <div key={s.key}>
                <label style={css.reportLabel}>{s.label}</label>
                <input style={css.reportInput} type="number" min="0" value={vals[s.key]} onChange={e => setVal(s.key, e.target.value)} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn onClick={async () => {
              await onUpdateEntry(entry.id, { date, ...Object.fromEntries(STATS.map(s => [s.key, parseInt(vals[s.key]) || 0])) });
              flash("Entry updated."); onClose();
            }} style={{ flex: 1, marginTop: 0 }}>Save Changes</Btn>
            <button onClick={onClose} style={{ ...css.cancelBtn, flex: 1 }}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const ConfirmDialog = ({ item, onConfirm, onCancel }) => (
    <div style={css.modal}>
      <div style={{ ...css.modalBox, maxWidth: 360 }}>
        <div style={{ fontSize: 24, textAlign: "center", marginBottom: 12 }}>⚠️</div>
        <p style={{ textAlign: "center", fontWeight: 600, margin: "0 0 6px" }}>{item.type === "user" ? "Delete this account?" : "Delete this entry?"}</p>
        <p style={{ textAlign: "center", fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
          {item.type === "user" ? "This will permanently remove the account and all their log entries." : "This log entry will be permanently removed."}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={{ ...css.deleteBtn, flex: 1 }}>Yes, Delete</button>
          <button onClick={onCancel}  style={{ ...css.cancelBtn, flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );

  const filteredEntries = (filterUid === "all" ? [...entries] : entries.filter(e => e.userId === filterUid))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ padding: "0 20px" }}>
      {editingUser  && <UserEditor  user={editingUser} onClose={() => setEditingUser(null)} />}
      {editingEntry && <EntryEditor entry={editingEntry} userName={users[editingEntry.userId] ? `${users[editingEntry.userId].first} ${users[editingEntry.userId].last}` : "Unknown"} onClose={() => setEditingEntry(null)} />}
      {confirmDel && (
        <ConfirmDialog
          item={confirmDel}
          onConfirm={async () => {
            if (confirmDel.type === "entry") { await onDeleteEntry(confirmDel.id); flash("Entry deleted."); }
            if (confirmDel.type === "user")  { await onDeleteUser(confirmDel.id);  flash("Account deleted."); }
            setConfirmDel(null);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      <div style={css.adminHeader}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, fontWeight: 700 }}>Admin Panel</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{Object.keys(users).length} accounts · {entries.length} log entries</div>
        </div>
        {saved && <div style={css.savedBadge}>{saved}</div>}
      </div>

      <div style={css.tabs}>
        <button style={{ ...css.tab, ...(tab === "accounts" ? css.tabOn : {}) }} onClick={() => setTab("accounts")}>Accounts ({Object.keys(users).length})</button>
        <button style={{ ...css.tab, ...(tab === "entries"  ? css.tabOn : {}) }} onClick={() => setTab("entries")}>Log Entries ({entries.length})</button>
      </div>

      {tab === "accounts" && (
        <div style={css.table}>
          <div style={css.tableHead}><span style={{ flex: 1 }}>Agent</span><span>Actions</span></div>
          {Object.values(users).length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No accounts yet.</div>}
          {Object.values(users).map(u => (
            <div key={u.id} style={{ ...css.tableRow, flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{u.first} {u.last}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{u.email} · {u.phone}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>SMD: {u.smd}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={css.editBtn} onClick={() => setEditingUser(u)}>Edit</button>
                <button style={css.deleteIconBtn} onClick={() => setConfirmDel({ type: "user", id: u.id })}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "entries" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={css.filterLabel}>Filter by Agent</label>
            <select style={{ ...css.input, width: "auto", minWidth: 200, display: "block" }} value={filterUid} onChange={e => setFilterUid(e.target.value)}>
              <option value="all">All Agents</option>
              {Object.values(users).map(u => <option key={u.id} value={u.id}>{u.first} {u.last}</option>)}
            </select>
          </div>
          <div style={css.table}>
            <div style={css.tableHead}><span style={{ flex: 1 }}>Agent / Date</span><span>Actions</span></div>
            {filteredEntries.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No entries found.</div>}
            {filteredEntries.map(e => {
              const u = users[e.userId];
              return (
                <div key={e.id} style={{ ...css.tableRow, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u ? `${u.first} ${u.last}` : "Unknown"}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{e.date}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                      {STATS.map(s => `${s.label.split(" ")[0]}: ${e[s.key] ?? 0}`).join(" · ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={css.editBtn} onClick={() => setEditingEntry(e)}>Edit</button>
                    <button style={css.deleteIconBtn} onClick={() => setConfirmDel({ type: "entry", id: e.id })}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={css.label}>{label}</label>
      <input style={css.input} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""} autoComplete="off" />
    </div>
  );
}

function Btn({ onClick, children, style, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      style={{ ...css.btn, ...(hov && !disabled ? { background: "#1e293b" } : {}), ...(disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}), ...style }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >{children}</button>
  );
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const css = {
  root:  { minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans','Helvetica Neue',sans-serif", color: "#0f172a" },
  app:   { maxWidth: 720, margin: "0 auto", paddingBottom: 48 },

  header:      { background: "#0f172a", padding: "0 20px", position: "sticky", top: 0, zIndex: 10, marginBottom: 32 },
  headerInner: { maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0" },
  headerBrand: { fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.12em", color: "#f1f5f9" },
  headerSub:   { fontSize: 11, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 },
  headerRight: { display: "flex", gap: 4, alignItems: "center" },
  navBtn:      { background: "transparent", border: "none", color: "#cbd5e1", fontSize: 13, cursor: "pointer", padding: "6px 10px", borderRadius: 6, fontFamily: "'DM Sans',sans-serif" },
  adminBadge:  { background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em" },

  card:      { background: "#fff", borderRadius: 16, padding: "32px 28px", margin: "0 20px", boxShadow: "0 1px 3px rgba(0,0,0,.07),0 8px 24px rgba(0,0,0,.05)", border: "1px solid #e2e8f0" },
  cardTitle: { fontFamily: "'Playfair Display',Georgia,serif", fontSize: 24, fontWeight: 700, margin: "0 0 24px" },

  label:      { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" },
  input:      { width: "100%", boxSizing: "border-box", padding: "10px 14px", fontSize: 15, border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#0f172a", outline: "none", fontFamily: "'DM Sans',sans-serif" },
  row2:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  error:      { background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 },
  btn:        { width: "100%", padding: 13, background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginTop: 8, transition: "background .15s" },
  switchLink: { textAlign: "center", marginTop: 16, fontSize: 13, color: "#64748b" },
  link:       { color: "#0f172a", fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  backBtn:    { background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, padding: 0, marginBottom: 16, fontFamily: "'DM Sans',sans-serif" },

  dateTag:     { display: "inline-block", background: "#f1f5f9", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600 },
  reportGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  reportLabel: { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" },
  reportInput: { width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 18, fontWeight: 700, border: "1.5px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#0f172a", outline: "none", fontFamily: "'DM Sans',sans-serif", textAlign: "center" },
  checkCircle: { width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" },

  controlBar:  { background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 14 },
  filterLabel: { fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 },
  pills:       { display: "flex", flexWrap: "wrap", gap: 6 },
  pill:        { padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  pillOn:      { background: "#0f172a", color: "#fff", border: "1.5px solid #0f172a" },

  goldNote:  { fontSize: 12, color: "#92400e", background: "#fef3c7", borderRadius: 6, padding: "5px 10px", marginBottom: 12, display: "inline-block" },
  logPrompt: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#1e40af" },
  logBtn:    { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  table:     { background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: "1px solid #e2e8f0", marginBottom: 20 },
  tableHead: { display: "flex", alignItems: "center", padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" },
  tableRow:  { display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #f1f5f9" },
  statNum:   { width: 80, textAlign: "right", fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" },
  meBadge:   { marginLeft: 7, fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#16a34a", borderRadius: 4, padding: "1px 6px", verticalAlign: "middle" },

  mySummary:     { background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)" },
  summaryGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 10 },
  summaryCell:   { background: "#f8fafc", borderRadius: 8, padding: "10px 8px", textAlign: "center", border: "1.5px solid transparent" },
  summaryCellOn: { border: "1.5px solid #0f172a", background: "#f1f5f9" },

  adminHeader:   { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  savedBadge:    { background: "#dcfce7", color: "#16a34a", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20 },
  tabs:          { display: "flex", gap: 4, marginBottom: 20, background: "#f1f5f9", borderRadius: 10, padding: 4 },
  tab:           { flex: 1, padding: 8, borderRadius: 8, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b", fontFamily: "'DM Sans',sans-serif" },
  tabOn:         { background: "#fff", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,.08)" },
  editBtn:       { padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 6, cursor: "pointer", color: "#0f172a", fontFamily: "'DM Sans',sans-serif" },
  deleteIconBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", color: "#dc2626", fontFamily: "'DM Sans',sans-serif" },
  deleteBtn:     { padding: 11, background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  cancelBtn:     { padding: 11, background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  modal:       { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modalBox:    { background: "#fff", borderRadius: 16, padding: "28px 24px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle:  { fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, fontWeight: 700 },
  modalClose:  { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8", padding: 4 },
};
