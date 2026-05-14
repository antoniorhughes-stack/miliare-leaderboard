const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

const SLACK_WEBHOOK = "https://hooks.slack.com/services/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";

exports.dailyLeaderboard = onSchedule(
  { schedule: "0 22 * * *", timeZone: "America/New_York" },
  async () => {
    const db = admin.firestore();

    const now = new Date();
    const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = est.toISOString().slice(0, 10);

    const entriesSnap = await db.collection("entries").where("date", "==", today).get();
    if (entriesSnap.empty) {
      await axios.post(SLACK_WEBHOOK, { text: `📊 *Daily Leaderboard — ${today}*\nNo activity logged today yet.` });
      return;
    }

    const usersSnap = await db.collection("users").get();
    const users = {};
    usersSnap.forEach(d => { users[d.id] = d.data(); });

    const totals = {};
    entriesSnap.forEach(d => {
      const e = d.data();
      if (!totals[e.userId]) {
        totals[e.userId] = { contacts: 0, appts_set: 0, appts_ran: 0, applications: 0, recruits: 0, fsm: 0, referrals: 0 };
      }
      totals[e.userId].contacts     += e.contacts || 0;
      totals[e.userId].appts_set    += e.appts_set || 0;
      totals[e.userId].appts_ran    += e.appts_ran || 0;
      totals[e.userId].applications += e.applications || 0;
      totals[e.userId].recruits     += e.recruits || 0;
      totals[e.userId].fsm          += e.fsm || 0;
      totals[e.userId].referrals    += e.referrals || 0;
    });

    const ranked = Object.entries(totals)
      .map(([uid, t]) => ({ uid, ...t, name: users[uid] ? `${users[uid].first} ${users[uid].last}` : "Unknown" }))
      .sort((a, b) => b.appts_ran - a.appts_ran);

    const medals = ["🥇", "🥈", "🥉"];
    let msg = `📊 *Daily Leaderboard — ${today}*\n\n`;

    ranked.forEach((r, i) => {
      const medal = medals[i] || `${i + 1}.`;
      msg += `${medal} *${r.name}*\n`;
      msg += `   Contacts: ${r.contacts} | Appts Set: ${r.appts_set} | Appts Ran: ${r.appts_ran} | Apps: ${r.applications} | Recruits: ${r.recruits} | FSM: ${r.fsm} | Referrals: ${r.referrals}\n\n`;
    });

    await axios.post(SLACK_WEBHOOK, { text: msg });
  }
);
