// content.js
// Runs on timetable.iitr.ac.in
// Waits for Angular to render, then scrapes the timetable table

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractTimetable") {
    waitForTimetable()
      .then(events => {
        if (events.length === 0) {
          sendResponse({ success: false, error: "No courses found. Make sure your timetable is loaded." });
        } else {
          sendResponse({ success: true, events: events });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });

    return true; // Required for async sendResponse
  }
});

// Polls every 500ms until the timetable table appears (max 8 seconds)
function waitForTimetable() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timetable didn't load in time. Try refreshing the page."));
    }, 8000);

    function tryExtract() {
      const table = document.querySelector('table.table-bordered.table-striped');
      // Wait until at least some td.fontsize cells exist (Angular is done rendering)
      const cells = table ? table.querySelectorAll('td.fontsize') : [];
      if (table && cells.length > 0) {
        clearTimeout(timeout);
        resolve(extractTimetable(table));
      } else {
        setTimeout(tryExtract, 500);
      }
    }

    tryExtract();
  });
}

function extractTimetable(table) {
  const events = [];

  // Step 1: Get day names from the table header (thead > tr > th)
  // First th is "Time" — skip it, rest are day names
  const headerCells = table.querySelectorAll('thead th');
  const days = [];
  headerCells.forEach((th, idx) => {
    if (idx === 0) return; // skip "Time" header
    days.push(th.textContent.trim());
  });

  // Step 2: Loop through each time-slot row in tbody
  const rows = table.querySelectorAll('tbody tr');

  rows.forEach(row => {
    // Get time from the <th> in this row e.g. "10.00-10.55"
    const timeTh = row.querySelector('th');
    if (!timeTh) return;

    const timeText = timeTh.textContent.trim();
    const { startTime, endTime } = parseTimeSlot(timeText);

    // Get all <td> cells in this row (each td = one day column)
    const cells = row.querySelectorAll('td');

    cells.forEach((td, colIdx) => {
      const day = days[colIdx];
      if (!day) return;

      // Course data is in the class attribute of the first <p> inside the cell
      // A course cell's <p> class starts with L (Lecture), T (Tutorial), or P (Practical)
      const p = td.querySelector('p');
      if (!p || !p.className) return;

      const firstToken = p.className.trim().split(/\s+/)[0];
      if (!['L', 'T', 'P'].includes(firstToken)) return; // not a course cell

      const parsed = parseCourseFromClass(p.className);
      if (!parsed) return;

      events.push({
        courseName: parsed.courseCode,
        room: parsed.room,
        day: normalizeDay(day),
        startTime,
        endTime
      });
    });
  });

  // Deduplicate: remove any entries with same course + day + time
  const seen = new Set();
  return events.filter(event => {
    const key = `${event.courseName}-${event.day}-${event.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Parses "10.00-10.55" → { startTime: "10:00", endTime: "10:55" }
function parseTimeSlot(timeStr) {
  const parts = timeStr.split('-');
  const startTime = parts[0]?.trim().replace('.', ':') || '08:00';
  const endTime   = parts[1]?.trim().replace('.', ':') || addOneHour(startTime);
  return { startTime, endTime };
}

// Parses the <p> class string: "L MSI-101 Batch 1 24ME1,... APJ AKB-005"
// Format: [Type] [CourseCode] [Batch?] [Sections] [FacultyNames] [Building] [Room]
function parseCourseFromClass(classStr) {
  const tokens = classStr.trim().split(/\s+/);
  if (tokens.length < 2) return null;

  const courseCode = tokens[1]; // e.g. "MSI-101"

  // Room is last token, building is second-to-last
  // e.g. last two tokens: "APJ" "AKB-005" → room = "APJ AKB-005"
  const room = tokens.length >= 2
    ? tokens.slice(-2).join(' ')  // e.g. "APJ AKB-005"
    : tokens[tokens.length - 1];

  return { courseCode, room };
}

// Normalizes various day formats to 3-letter abbreviation
function normalizeDay(day) {
  const map = {
    'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed',
    'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat',
    'Mon': 'Mon', 'Tue': 'Tue', 'Wed': 'Wed',
    'Thu': 'Thu', 'Fri': 'Fri', 'Sat': 'Sat'
  };
  return map[day] || day.substring(0, 3);
}

// Fallback: add 1 hour if end time is missing
function addOneHour(time) {
  const [h, m] = time.split(':').map(Number);
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
