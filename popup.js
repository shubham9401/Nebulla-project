// popup.js
// Handles the button click → messages content.js → generates ICS → downloads it

const exportBtn = document.getElementById('export-btn');
const btnText = document.getElementById('btn-text');
const pdfBtn = document.getElementById('pdf-btn');
const pdfBtnText = document.getElementById('pdf-btn-text');
const statusBox = document.getElementById('status-box');

exportBtn.addEventListener('click', async () => {
  setLoading(true, 'ics');
  showStatus('', '');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('timetable.iitr.ac.in')) {
      showStatus('error', '❌ Please open timetable.iitr.ac.in first.');
      setLoading(false, 'ics');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'extractTimetable' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('error', '❌ Could not read the page. Try refreshing the timetable.');
        setLoading(false, 'ics');
        return;
      }

      if (!response.success) {
        showStatus('error', '❌ ' + response.error);
        setLoading(false, 'ics');
        return;
      }

      const icsContent = generateICS(response.events);
      downloadICS(icsContent);

      showStatus('success', `✅ Exported ${response.events.length} classes! Import the downloaded file into Google Calendar.`);
      setLoading(false, 'ics');
    });

  } catch (err) {
    showStatus('error', '❌ Something went wrong: ' + err.message);
    setLoading(false, 'ics');
  }
});

// ─── PDF Button ───────────────────────────────────────────────────────────────

pdfBtn.addEventListener('click', async () => {
  setLoading(true, 'pdf');
  showStatus('', '');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('timetable.iitr.ac.in')) {
      showStatus('error', '❌ Please open timetable.iitr.ac.in first.');
      setLoading(false, 'pdf');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'extractTimetable' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('error', '❌ Could not read the page. Try refreshing the timetable.');
        setLoading(false, 'pdf');
        return;
      }

      if (!response.success) {
        showStatus('error', '❌ ' + response.error);
        setLoading(false, 'pdf');
        return;
      }

      openTimetablePDF(response.events);
      showStatus('success', '✅ Timetable opened! Press Ctrl+P → Save as PDF.');
      setLoading(false, 'pdf');
    });

  } catch (err) {
    showStatus('error', '❌ Something went wrong: ' + err.message);
    setLoading(false, 'pdf');
  }
});

// ─── ICS Generator ────────────────────────────────────────────────────────────

function generateICS(events) {
  const dayMap = {
    'Mon': 'MO', 'Tue': 'TU', 'Wed': 'WE',
    'Thu': 'TH', 'Fri': 'FR', 'Sat': 'SA'
  };

  // Semester start date — adjust this to the actual start date
  // Format: YYYYMMDD  (use the first Monday of your semester)
  const SEMESTER_START = '20260801';

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotify//IITR Timetable//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ].join('\r\n');

  events.forEach(event => {
    const byday = dayMap[event.day] || 'MO';
    const start = formatDateTime(SEMESTER_START, event.startTime);
    const end = formatDateTime(SEMESTER_START, event.endTime);
    const uid = `${event.courseName}-${event.day}-${event.startTime}@slotify`.replace(/\s/g, '-');

    ics += '\r\n' + [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${event.courseName}`,
      `LOCATION:${event.room}`,
      `DTSTART;TZID=Asia/Kolkata:${start}`,
      `DTEND;TZID=Asia/Kolkata:${end}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  ics += '\r\nEND:VCALENDAR';
  return ics;
}

// Converts "20260801" + "08:00" → "20260801T080000"
function formatDateTime(date, time) {
  const t = time.replace(':', '') + '00'; // "0800" → "080000"
  return `${date}T${t}`;
}

// ─── File Download ─────────────────────────────────────────────────────────────

function downloadICS(icsString) {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'slotify-timetable.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function setLoading(isLoading, type) {
  if (type === 'pdf') {
    pdfBtn.disabled = isLoading;
    pdfBtnText.textContent = isLoading ? 'Generating...' : 'Download PDF Timetable';
  } else {
    exportBtn.disabled = isLoading;
    btnText.textContent = isLoading ? 'Exporting...' : 'Export to Google Calendar';
  }
}

function showStatus(type, message) {
  if (!message) {
    statusBox.className = 'status hidden';
    return;
  }
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

function openTimetablePDF(events) {
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [...new Set(events.map(e => e.day))].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  const times = [...new Set(events.map(e => e.startTime))].sort();

  // Build lookup: 'Mon-10:00' → event
  const lookup = {};
  events.forEach(e => { lookup[`${e.day}-${e.startTime}`] = e; });

  const dayHeaders = days.map(d => `<th>${d}</th>`).join('');

  const rows = times.map(time => {
    const cells = days.map(day => {
      const ev = lookup[`${day}-${time}`];
      return ev
        ? `<td class="course course-${ev.type || 'L'}"><span class="badge badge-${ev.type || 'L'}">${ev.type || 'L'}</span><br><strong>${ev.courseName}</strong><br><span class="room">${ev.room}</span></td>`
        : `<td class="empty"></td>`;
    }).join('');
    return `<tr><td class="time">${time}</td>${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IITR Timetable — Slotify</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: #f8fafc; }
    h1 { font-size: 20px; color: #0f172a; margin-bottom: 4px; font-weight: 700; }
    .subtitle { font-size: 12px; color: #94a3b8; margin-bottom: 22px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    th { background: #1e293b; color: #e2e8f0; padding: 10px 12px; text-align: center; font-weight: 600; font-size: 12px; letter-spacing: 0.03em; }
    td { border: 1px solid #f1f5f9; padding: 8px 10px; text-align: center; vertical-align: middle; background: #fff; }
    .time { background: #f8fafc; font-weight: 600; color: #475569; white-space: nowrap; font-size: 11px; }
    .course { background: #fff; }
    .course-L { border-left: 3px solid #1d4ed8; }
    .course-T { border-left: 3px solid #16a34a; }
    .course-P { border-left: 3px solid #dc2626; }
    .course strong { display: block; font-size: 12px; color: #0f172a; margin: 2px 0; }
    .room { font-size: 10px; color: #94a3b8; }
    .badge { display: inline-block; font-size: 9px; font-weight: 700; border-radius: 3px; padding: 1px 5px; margin-bottom: 3px; letter-spacing: 0.05em; }
    .badge-L { background: #dbeafe; color: #1d4ed8; }
    .badge-T { background: #dcfce7; color: #16a34a; }
    .badge-P { background: #fee2e2; color: #dc2626; }
    .empty { background: #f8fafc; }
    .print-btn { margin-bottom: 20px; padding: 8px 18px; background: #1e293b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .print-btn:hover { background: #334155; }
    @media print { .print-btn { display: none; } body { background: #fff; padding: 15px; } }
  </style>
</head>
<body>
  <h1>📅 IITR Timetable</h1>
  <p class="subtitle">Generated by Slotify · ${events.length} sessions/week</p>
  <button class="print-btn" onclick="window.print()">🖨️ Save as PDF (Ctrl+P)</button>
  <table>
    <thead><tr><th>Time</th>${dayHeaders}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>setTimeout(() => window.print(), 800);<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
