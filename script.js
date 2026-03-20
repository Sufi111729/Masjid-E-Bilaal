import {
  addDoc,
  approvedJobsQuery,
  announcementsQuery,
  announcementsRef,
  auth,
  deleteDoc,
  doc,
  getDoc,
  isFirebaseConfigured,
  jobsQuery,
  jobsRef,
  onSnapshot,
  prayerTimingsRef,
  serverTimestamp,
  setDoc,
  updateDoc
} from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const prayerOrder = ["Fajr", "Zuhr", "Asr", "Maghrib", "Isha", "Jumuah"];
const DEMO_EMAIL = "admin@masjidebilaal.com";
const DEMO_PASSWORD = "Masjid123!";
const DEMO_SESSION_KEY = "masjid-e-bilaal-demo-admin";
const DEMO_PRAYER_KEY = "masjid-e-bilaal-demo-prayers";
const DEMO_ANNOUNCEMENT_KEY = "masjid-e-bilaal-demo-announcements";
const JOBS_STORAGE_KEY = "masjid-e-bilaal-jobs";
const APP_TIMEZONE = "Asia/Kolkata";
const ANNOUNCEMENT_POPUP_KEY = "masjid-e-bilaal-announcement-popup-dismissed";

const defaultPrayerTimings = {
  fajr: "5:30 AM",
  zuhr: "1:15 PM",
  asr: "4:45 PM",
  maghrib: "6:28 PM",
  isha: "7:45 PM",
  jumuah: "1:30 PM"
};

const defaultAnnouncements = [
  {
    id: "demo-1",
    title: "Jumma Namaz Update",
    description: "Jumma timing has been confirmed for 1:30 PM. Please arrive early.",
    createdAt: Date.now()
  },
  {
    id: "demo-2",
    title: "Weekend Quran Class",
    description: "New Quran revision circle will begin after Asr on Saturday.",
    createdAt: Date.now() - 86400000
  }
];

const defaultJobs = [
  {
    id: "job-1",
    title: "Madrasa Teacher Assistant",
    description: "Part-time support needed for weekend Quran classes and student coordination.",
    pdfName: "madrasa-teacher-assistant.pdf",
    pdfData: "",
    createdAt: Date.now() - 3 * 60 * 60 * 1000,
    status: "approved"
  },
  {
    id: "job-2",
    title: "Masjid Office Volunteer",
    description: "Help with front desk guidance, records, and event registration during community programs.",
    pdfName: "office-volunteer-notice.pdf",
    pdfData: "",
    createdAt: Date.now() - 20 * 60 * 60 * 1000,
    status: "approved"
  }
];

function setupNav() {
  const siteHeader = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const siteNav = document.querySelector(".site-nav");
  const navPanel = document.querySelector(".nav-panel");
  if (!navToggle || !siteNav || !navPanel) return;

  const closeNav = () => {
    siteNav.classList.remove("open");
    navPanel.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navPanel.classList.toggle("open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  document.addEventListener("click", (event) => {
    if (!navPanel.classList.contains("open")) return;
    if (siteHeader?.contains(event.target)) return;
    closeNav();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1080) closeNav();
  });

  const syncHeaderScrollState = () => {
    if (!siteHeader) return;
    siteHeader.classList.toggle("is-scrolled", window.scrollY > 18);
  };

  syncHeaderScrollState();
  window.addEventListener("scroll", syncHeaderScrollState, { passive: true });
}

function setupRevealAnimations() {
  const revealElements = document.querySelectorAll(".reveal");
  if (!revealElements.length) return;

  if (!("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });

  revealElements.forEach((element) => observer.observe(element));
}

function setFeedback(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = type ? `form-feedback ${type}` : "form-feedback";
}

function toggleLoader(element, isVisible) {
  if (!element) return;
  element.classList.toggle("is-visible", Boolean(isVisible));
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseTimeToMinutes(timeString = "") {
  const match = timeString.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function getCurrentTimePartsInTimezone(timeZone = APP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const getPart = (type) => Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    hours: getPart("hour"),
    minutes: getPart("minute"),
    seconds: getPart("second")
  };
}

function setupHijriEidStatus() {
  const hijriDateElement = document.getElementById("hero-hijri-date");
  const eidStatusElement = document.getElementById("hero-eid-status");
  const eidStatusBox = document.getElementById("hero-eid-status-box");
  const eidBanner = document.getElementById("eid-banner");
  const eidBannerText = document.getElementById("eid-banner-text");
  if (!hijriDateElement || !eidStatusElement) return;

  try {
    const adjustedNow = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hijriDisplayFormatter = new Intl.DateTimeFormat("en-IN-u-ca-islamic", {
      timeZone: APP_TIMEZONE,
      day: "numeric",
      month: "long"
    });
    const hijriDetectFormatter = new Intl.DateTimeFormat("en-IN-u-ca-islamic", {
      timeZone: APP_TIMEZONE,
      day: "numeric",
      month: "numeric",
      year: "numeric"
    });

    const detectParts = hijriDetectFormatter.formatToParts(adjustedNow);
    const day = Number(detectParts.find((part) => part.type === "day")?.value || 0);
    const month = Number(detectParts.find((part) => part.type === "month")?.value || 0);
    const year = detectParts.find((part) => part.type === "year")?.value || "";

    hijriDateElement.textContent = hijriDisplayFormatter.format(adjustedNow);

    const isEidAlFitr = day === 1 && month === 10;
    const isEidAlAdha = day === 10 && month === 12;

    if (isEidAlFitr) {
      if (eidStatusBox) eidStatusBox.hidden = false;
      eidStatusElement.textContent = `Today is Eid-ul-Fitr ${year}`;
      if (eidBanner) eidBanner.hidden = false;
      if (eidBannerText) eidBannerText.textContent = "Eid-ul-Fitr Mubarak from Masjid-E-Bilaal Kundwa (urf Dilipnagar)";
      return;
    }

    if (isEidAlAdha) {
      if (eidStatusBox) eidStatusBox.hidden = false;
      eidStatusElement.textContent = `Today is Eid-ul-Adha ${year}`;
      if (eidBanner) eidBanner.hidden = false;
      if (eidBannerText) eidBannerText.textContent = "Eid-ul-Adha Mubarak from Masjid-E-Bilaal Kundwa (urf Dilipnagar)";
      return;
    }

    if (eidStatusBox) eidStatusBox.hidden = true;
    if (eidBanner) eidBanner.hidden = true;
    eidStatusElement.textContent = "No Eid today";
  } catch (error) {
    if (eidStatusBox) eidStatusBox.hidden = true;
    if (eidBanner) eidBanner.hidden = true;
    hijriDateElement.textContent = "Hijri date unavailable";
    eidStatusElement.textContent = "Eid status unavailable";
  }
}

function formatAnnouncementDate(timestamp) {
  const dateValue = typeof timestamp?.toDate === "function"
    ? timestamp.toDate()
    : typeof timestamp === "number"
      ? new Date(timestamp)
      : null;

  if (!dateValue) return "Just now";

  return dateValue.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getAnnouncementIdentity(item) {
  if (!item) return "";
  if (item.id) return String(item.id);
  const title = item.title || "announcement";
  const createdAt = typeof item.createdAt?.toDate === "function"
    ? item.createdAt.toDate().getTime()
    : typeof item.createdAt === "number"
      ? item.createdAt
      : "unknown";
  return `${title}-${createdAt}`;
}

function setupAnnouncementPopup() {
  const popup = document.getElementById("announcement-popup");
  if (!popup) return null;

  const title = document.getElementById("announcement-popup-title");
  const description = document.getElementById("announcement-popup-description");
  const date = document.getElementById("announcement-popup-date");
  const closeButton = document.getElementById("announcement-popup-close");
  const dismissButton = document.getElementById("announcement-popup-dismiss");
  const backdrop = document.getElementById("announcement-popup-backdrop");

  const closePopup = () => {
    popup.hidden = true;
  };

  const dismissPopup = () => {
    const announcementId = popup.dataset.announcementId || "";
    if (announcementId) localStorage.setItem(ANNOUNCEMENT_POPUP_KEY, announcementId);
    closePopup();
  };

  closeButton?.addEventListener("click", closePopup);
  dismissButton?.addEventListener("click", dismissPopup);
  backdrop?.addEventListener("click", closePopup);

  return {
    show(item) {
      const identity = getAnnouncementIdentity(item);
      if (!identity || localStorage.getItem(ANNOUNCEMENT_POPUP_KEY) === identity) {
        popup.hidden = true;
        return;
      }

      popup.dataset.announcementId = identity;
      date.textContent = formatAnnouncementDate(item.createdAt);
      title.textContent = item.title || "Latest announcement";
      description.textContent = item.description || "";
      popup.hidden = false;
    }
  };
}

function getDemoSession() {
  return sessionStorage.getItem(DEMO_SESSION_KEY) === "true";
}

function setDemoSession(enabled) {
  sessionStorage.setItem(DEMO_SESSION_KEY, String(Boolean(enabled)));
}

function getDemoPrayerTimings() {
  const stored = localStorage.getItem(DEMO_PRAYER_KEY);
  if (!stored) {
    localStorage.setItem(DEMO_PRAYER_KEY, JSON.stringify(defaultPrayerTimings));
    return { ...defaultPrayerTimings };
  }
  return { ...defaultPrayerTimings, ...JSON.parse(stored) };
}

function saveDemoPrayerTimings(values) {
  localStorage.setItem(DEMO_PRAYER_KEY, JSON.stringify(values));
}

function getDemoAnnouncements() {
  const stored = localStorage.getItem(DEMO_ANNOUNCEMENT_KEY);
  if (!stored) {
    localStorage.setItem(DEMO_ANNOUNCEMENT_KEY, JSON.stringify(defaultAnnouncements));
    return [...defaultAnnouncements];
  }
  return JSON.parse(stored);
}

function saveDemoAnnouncements(items) {
  localStorage.setItem(DEMO_ANNOUNCEMENT_KEY, JSON.stringify(items));
}

function readJobs() {
  const stored = localStorage.getItem(JOBS_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(defaultJobs));
    return [...defaultJobs];
  }
  return JSON.parse(stored);
}

function saveJobs(items) {
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(items));
}

function normalizeJobs(items) {
  return items.map((item) => ({
    status: "pending",
    ...item
  }));
}

function buildPrayerCards(timings) {
  return prayerOrder.map((name) => {
    const value = timings[name.toLowerCase()] || "--";
    return `
      <article class="prayer-card" data-prayer-name="${name}" data-prayer-time="${escapeHtml(value)}">
        <span>${name}</span>
        <strong>${escapeHtml(value)}</strong>
        <p>${name === "Jumuah" ? "Friday khutbah and congregation timing." : "Live timing from the masjid admin dashboard."}</p>
      </article>
    `;
  }).join("");
}

function updatePrayerStatus() {
  const cards = [...document.querySelectorAll(".prayer-card")];
  if (!cards.length) return;

  const label = document.getElementById("current-prayer-label");
  const description = document.getElementById("current-prayer-description");
  const heroTitle = document.getElementById("hero-prayer-title");
  const heroCopy = document.getElementById("hero-prayer-copy");
  const heroCurrentPrayer = document.getElementById("hero-current-prayer");
  const heroNextPrayer = document.getElementById("hero-next-prayer");
  const now = getCurrentTimePartsInTimezone();
  const nowMinutes = now.hours * 60 + now.minutes;

  const prayers = cards
    .filter((card) => card.dataset.prayerName !== "Jumuah")
    .map((card) => ({
      card,
      name: card.dataset.prayerName,
      label: card.querySelector("strong")?.textContent || "--",
      minutes: parseTimeToMinutes(card.dataset.prayerTime)
    }))
    .filter((prayer) => prayer.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);

  if (!prayers.length) {
    if (label) label.textContent = "Prayer timings unavailable";
    if (description) description.textContent = "Ask the admin to update the prayer timings document in Firestore.";
    if (heroCurrentPrayer) heroCurrentPrayer.textContent = "--";
    if (heroNextPrayer) heroNextPrayer.textContent = "--";
    return;
  }

  let currentPrayer = null;
  let nextPrayer = prayers[0];

  prayers.forEach((prayer, index) => {
    const next = prayers[index + 1];
    if (nowMinutes >= prayer.minutes && (!next || nowMinutes < next.minutes)) {
      currentPrayer = prayer;
      nextPrayer = next || prayers[0];
    }
  });

  cards.forEach((card) => card.classList.remove("active", "next"));

  if (currentPrayer) {
    currentPrayer.card.classList.add("active");
    if (label) label.textContent = `${currentPrayer.name} is the current prayer window`;
    if (description) description.textContent = `The next prayer is ${nextPrayer.name} at ${nextPrayer.label}.`;
    if (heroTitle) heroTitle.textContent = `${currentPrayer.name} in focus`;
    if (heroCopy) heroCopy.textContent = `Next congregation: ${nextPrayer.name} at ${nextPrayer.label}.`;
    if (heroCurrentPrayer) heroCurrentPrayer.textContent = `${currentPrayer.name} • ${currentPrayer.label}`;
    if (heroNextPrayer) heroNextPrayer.textContent = `${nextPrayer.name} • ${nextPrayer.label}`;
  } else {
    if (label) label.textContent = `The next prayer is ${nextPrayer.name}`;
    if (description) description.textContent = `Prepare for congregation at ${nextPrayer.label}.`;
    if (heroTitle) heroTitle.textContent = `${nextPrayer.name} is coming next`;
    if (heroCopy) heroCopy.textContent = `Current live schedule shows ${nextPrayer.label} for the next congregation.`;
    if (heroCurrentPrayer) heroCurrentPrayer.textContent = "Before first prayer";
    if (heroNextPrayer) heroNextPrayer.textContent = `${nextPrayer.name} • ${nextPrayer.label}`;
  }

  if (nextPrayer) nextPrayer.card.classList.add("next");
}

function renderHeroMiniTimings(timings) {
  const container = document.getElementById("hero-mini-timings");
  if (!container) return;

  container.innerHTML = prayerOrder
    .slice(0, 5)
    .map((name) => `
      <div>
        <span>${name}</span>
        <strong>${escapeHtml(timings[name.toLowerCase()] || "--")}</strong>
      </div>
    `)
    .join("");
}

function setupHeroClock() {
  const clock = document.getElementById("hero-live-clock");
  if (!clock) return;

  const renderClock = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString("en-IN", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  };

  renderClock();
  window.setInterval(renderClock, 1000);
}

function setupPublicPage() {
  if (document.body.dataset.page !== "public") return;

  const prayerGrid = document.getElementById("prayer-grid");
  const prayerLoader = document.getElementById("prayer-loader");
  const announcementList = document.getElementById("announcement-list");
  const announcementLoader = document.getElementById("announcement-loader");
  const announcementPopup = setupAnnouncementPopup();

  const renderAnnouncementItems = (items) => {
    if (!items.length) {
      announcementList.innerHTML = `
        <div class="empty-state">
          <h3>No announcements available</h3>
          <p>New updates from Masjid-E-Bilaal will appear here once published.</p>
        </div>
      `;
      return;
    }

    announcementList.innerHTML = items.map((item, index) => `
      <article class="announcement-card reveal ${index % 3 === 1 ? "delay-1" : index % 3 === 2 ? "delay-2" : ""} visible">
        <span class="announcement-date">${escapeHtml(formatAnnouncementDate(item.createdAt))}</span>
        <h3>${escapeHtml(item.title || "Untitled announcement")}</h3>
        <p>${escapeHtml(item.description || "")}</p>
      </article>
    `).join("");

    announcementPopup?.show(items[0]);
  };

  toggleLoader(prayerLoader, true);
  toggleLoader(announcementLoader, true);

  if (!isFirebaseConfigured) {
    const renderDemoPublicData = () => {
      const timings = getDemoPrayerTimings();
      toggleLoader(prayerLoader, false);
      prayerGrid.innerHTML = buildPrayerCards(timings);
      renderHeroMiniTimings(timings);
      updatePrayerStatus();

      const announcements = getDemoAnnouncements().sort((a, b) => b.createdAt - a.createdAt);
      toggleLoader(announcementLoader, false);
      renderAnnouncementItems(announcements);
    };

    renderDemoPublicData();
    window.addEventListener("storage", (event) => {
      if ([DEMO_PRAYER_KEY, DEMO_ANNOUNCEMENT_KEY].includes(event.key)) {
        renderDemoPublicData();
      }
    });
    return;
  }

  onSnapshot(prayerTimingsRef, (snapshot) => {
    toggleLoader(prayerLoader, false);

    if (!snapshot.exists()) {
      prayerGrid.innerHTML = `
        <div class="empty-state">
          <h3>No prayer timings available</h3>
          <p>The admin has not published the prayerTimings/daily document yet.</p>
        </div>
      `;
      renderHeroMiniTimings({});
      return;
    }

    const timings = snapshot.data();
    prayerGrid.innerHTML = buildPrayerCards(timings);
    prayerGrid.querySelectorAll(".prayer-card").forEach((card, index) => {
      card.classList.add("reveal");
      if (index % 3 === 1) card.classList.add("delay-1");
      if (index % 3 === 2) card.classList.add("delay-2");
      card.classList.add("visible");
    });
    renderHeroMiniTimings(timings);
    updatePrayerStatus();
  }, () => {
    toggleLoader(prayerLoader, false);
    prayerGrid.innerHTML = `
      <div class="empty-state">
        <h3>Unable to load prayer timings</h3>
        <p>Check your Firebase configuration and Firestore permissions.</p>
      </div>
    `;
  });

  onSnapshot(announcementsQuery, (snapshot) => {
    toggleLoader(announcementLoader, false);
    const demoAnnouncements = getDemoAnnouncements().sort((a, b) => b.createdAt - a.createdAt);

    if (snapshot.empty) {
      renderAnnouncementItems(demoAnnouncements);
      return;
    }

    const items = snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data()
    }));

    renderAnnouncementItems(items);
  }, () => {
    toggleLoader(announcementLoader, false);
    const demoAnnouncements = getDemoAnnouncements().sort((a, b) => b.createdAt - a.createdAt);
    if (demoAnnouncements.length) {
      renderAnnouncementItems(demoAnnouncements);
      return;
    }

    announcementList.innerHTML = `
      <div class="empty-state">
        <h3>Unable to load announcements</h3>
        <p>Check your Firebase configuration and Firestore rules.</p>
      </div>
    `;
  });
}

function validatePrayerFormValues(values) {
  return Object.values(values).every((value) => /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(value.trim()));
}

function setupJobsPage() {
  if (document.body.dataset.page !== "jobs") return;

  const form = document.getElementById("job-form");
  const feedback = document.getElementById("job-feedback");
  const jobList = document.getElementById("job-list");
  const expiryMs = 2 * 24 * 60 * 60 * 1000;

  const formatJobDate = (timestamp) => new Date(timestamp).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const getExpiryStatus = (createdAt) => {
    const remainingMs = expiryMs - (Date.now() - createdAt);
    const remainingHours = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
    if (remainingHours <= 24) return `${remainingHours}h remaining`;
    return `${Math.ceil(remainingHours / 24)} day(s) remaining`;
  };

  const purgeExpiredJobs = () => {
    const active = normalizeJobs(readJobs()).filter((item) => {
      if (item.status !== "approved") return true;
      return Date.now() - item.createdAt < expiryMs;
    });
    saveJobs(active);
    return active;
  };

  const renderJobs = () => {
    const jobs = purgeExpiredJobs()
      .filter((job) => job.status === "approved")
      .sort((a, b) => b.createdAt - a.createdAt);
    if (!jobs.length) {
      jobList.innerHTML = `
        <div class="empty-state">
          <h3>No active job notices</h3>
          <p>Post a new job notice to populate the board.</p>
        </div>
      `;
      return;
    }

    jobList.innerHTML = jobs.map((job) => {
      const viewButton = job.pdfData
        ? `<a class="btn btn-primary" href="${job.pdfData}" target="_blank" rel="noopener">View PDF</a>`
        : `<button class="btn btn-outline" type="button" disabled>Demo PDF</button>`;

      return `
        <article class="job-card">
          <div>
            <span class="eyebrow">Job Notice</span>
            <h3>${escapeHtml(job.title)}</h3>
            <p>${escapeHtml(job.description)}</p>
          </div>
          <div class="job-meta">
            <span class="meta-chip">Posted: ${formatJobDate(job.createdAt)}</span>
            <span class="meta-chip">Expires in 2 days</span>
            <span class="meta-chip">${getExpiryStatus(job.createdAt)}</span>
          </div>
          <p><strong>PDF:</strong> <span class="job-file-name">${escapeHtml(job.pdfName)}</span></p>
          ${viewButton}
        </article>
      `;
    }).join("");
  };

  if (!isFirebaseConfigured) {
    renderJobs();
    window.addEventListener("storage", (event) => {
      if (event.key === JOBS_STORAGE_KEY) renderJobs();
    });
  } else {
    jobList.innerHTML = `
      <div class="empty-state">
        <h3>Loading approved jobs</h3>
        <p>Please wait while approved job notices are fetched.</p>
      </div>
    `;
    onSnapshot(approvedJobsQuery, (snapshot) => {
      const jobs = snapshot.docs
        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
        .filter((job) => {
          const createdAt = typeof job.createdAt?.toDate === "function" ? job.createdAt.toDate().getTime() : 0;
          return Date.now() - createdAt < expiryMs;
        });

      if (!jobs.length) {
        jobList.innerHTML = `
          <div class="empty-state">
            <h3>No active job notices</h3>
            <p>No approved jobs are available right now.</p>
          </div>
        `;
        return;
      }

      jobList.innerHTML = jobs.map((job) => {
        const pdfUrl = job.pdfData || "";
        const viewButton = pdfUrl
          ? `<a class="btn btn-primary" href="${pdfUrl}" target="_blank" rel="noopener">View PDF</a>`
          : `<button class="btn btn-outline" type="button" disabled>No PDF</button>`;

        return `
          <article class="job-card">
            <div>
              <span class="eyebrow">Approved Job</span>
              <h3>${escapeHtml(job.title || "Untitled job")}</h3>
              <p>${escapeHtml(job.description || "")}</p>
            </div>
            <div class="job-meta">
              <span class="meta-chip">Approved</span>
              <span class="meta-chip">Posted: ${escapeHtml(formatAnnouncementDate(job.createdAt))}</span>
            </div>
            <p><strong>PDF:</strong> <span class="job-file-name">${escapeHtml(job.pdfName || "Not provided")}</span></p>
            ${viewButton}
          </article>
        `;
      }).join("");
    });
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = form.jobTitle.value.trim();
    const description = form.jobDescription.value.trim();
    const pdfFile = form.jobPdf.files[0];

    if (!title || !description || !pdfFile) {
      setFeedback(feedback, "Please enter title, description, and a PDF file.", "error");
      return;
    }

    if (pdfFile.type !== "application/pdf") {
      setFeedback(feedback, "Only PDF files are allowed.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const payload = {
        title,
        description,
        pdfName: pdfFile.name,
        pdfData: reader.result,
        status: "pending"
      };

      if (isFirebaseConfigured) {
        try {
          await addDoc(jobsRef, {
            ...payload,
            createdAt: serverTimestamp()
          });
          form.reset();
          setFeedback(feedback, "Job submitted successfully. It is waiting for admin approval.", "success");
        } catch (error) {
          setFeedback(feedback, error.message, "error");
        }
        return;
      }

      const items = purgeExpiredJobs();
      items.push({
        id: `job-${Date.now()}`,
        ...payload,
        createdAt: Date.now()
      });
      saveJobs(items);
      renderJobs();
      form.reset();
      setFeedback(feedback, "Job submitted successfully. It is waiting for admin approval.", "success");
    };
    reader.readAsDataURL(pdfFile);
  });
}

function setupAdminPage() {
  if (document.body.dataset.page !== "admin") return;

  const authPanel = document.getElementById("auth-panel");
  const dashboard = document.getElementById("admin-dashboard");
  const loginForm = document.getElementById("login-form");
  const loginFeedback = document.getElementById("login-feedback");
  const logoutButton = document.getElementById("logout-button");
  const headerLogoutButton = document.getElementById("header-logout-button");
  const adminUserEmail = document.getElementById("admin-user-email");
  const prayerForm = document.getElementById("prayer-form");
  const prayerFeedback = document.getElementById("prayer-form-feedback");
  const announcementForm = document.getElementById("announcement-form");
  const announcementFeedback = document.getElementById("announcement-form-feedback");
  const adminAnnouncementList = document.getElementById("admin-announcement-list");
  const adminJobForm = document.getElementById("admin-job-form");
  const adminJobFeedback = document.getElementById("admin-job-feedback");
  const adminJobPendingList = document.getElementById("admin-job-pending-list");
  const adminJobApprovedList = document.getElementById("admin-job-approved-list");
  const adminJobResetButton = document.getElementById("admin-job-reset-button");
  const adminJobSubmitButton = document.getElementById("admin-job-submit-button");
  const resetButton = document.getElementById("announcement-reset-button");
  const submitButton = document.getElementById("announcement-submit-button");

  const resetAnnouncementForm = () => {
    announcementForm.reset();
    announcementForm.announcementId.value = "";
    submitButton.textContent = "Publish Announcement";
    setFeedback(announcementFeedback, "");
  };

  const resetAdminJobForm = () => {
    adminJobForm.reset();
    adminJobForm.jobId.value = "";
    adminJobSubmitButton.textContent = "Update Job";
    setFeedback(adminJobFeedback, "");
  };

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = loginForm.email.value.trim();
    const password = loginForm.password.value.trim();

    if (!email || !password) {
      setFeedback(loginFeedback, "Enter both email and password.", "error");
      return;
    }

    if (!isFirebaseConfigured) {
      if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        setDemoSession(true);
        setFeedback(loginFeedback, "Demo admin login successful.", "success");
        loginForm.reset();
        authPanel.hidden = true;
        dashboard.hidden = false;
        adminUserEmail.textContent = `Signed in user: ${DEMO_EMAIL} (demo mode)`;
        await hydratePrayerFormFromSource();
        renderDemoAdminAnnouncements();
        renderDemoJobs();
      } else {
        setFeedback(loginFeedback, "Use the default demo credentials shown in the form.", "error");
      }
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setFeedback(loginFeedback, "Login successful.", "success");
      loginForm.reset();
    } catch (error) {
      if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        setDemoSession(true);
        setFeedback(loginFeedback, "Firebase login unavailable. Signed in with demo admin mode.", "success");
        loginForm.reset();
        authPanel.hidden = true;
        dashboard.hidden = false;
        adminUserEmail.textContent = `Signed in user: ${DEMO_EMAIL} (demo mode)`;
        await hydratePrayerFormFromSource();
        renderDemoAdminAnnouncements();
        renderDemoJobs();
      } else {
        setFeedback(loginFeedback, error.message, "error");
      }
    }
  });

  logoutButton?.addEventListener("click", async () => {
    if (getDemoSession()) {
      setDemoSession(false);
      authPanel.hidden = false;
      dashboard.hidden = true;
      adminUserEmail.textContent = "Signed in user: --";
      if (headerLogoutButton) headerLogoutButton.hidden = true;
      return;
    }
    await signOut(auth);
  });

  headerLogoutButton?.addEventListener("click", async () => {
    logoutButton?.click();
  });

  resetButton?.addEventListener("click", resetAnnouncementForm);
  adminJobResetButton?.addEventListener("click", resetAdminJobForm);

  prayerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = {
      fajr: prayerForm.fajr.value.trim(),
      zuhr: prayerForm.zuhr.value.trim(),
      asr: prayerForm.asr.value.trim(),
      maghrib: prayerForm.maghrib.value.trim(),
      isha: prayerForm.isha.value.trim(),
      jumuah: prayerForm.jumuah.value.trim()
    };

    if (!validatePrayerFormValues(values)) {
      setFeedback(prayerFeedback, "Use the format 5:30 AM for all prayer timing fields.", "error");
      return;
    }

    if (getDemoSession() || !isFirebaseConfigured) {
      saveDemoPrayerTimings(values);
      setFeedback(prayerFeedback, "Prayer timings updated successfully in demo mode.", "success");
      return;
    }

    try {
      await setDoc(prayerTimingsRef, values, { merge: true });
      setFeedback(prayerFeedback, "Prayer timings updated successfully.", "success");
    } catch (error) {
      setFeedback(prayerFeedback, error.message, "error");
    }
  });

  announcementForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = announcementForm.announcementId.value.trim();
    const title = announcementForm.title.value.trim();
    const description = announcementForm.description.value.trim();

    if (!title || !description) {
      setFeedback(announcementFeedback, "Enter both title and description.", "error");
      return;
    }

    if (getDemoSession() || !isFirebaseConfigured) {
      const items = getDemoAnnouncements();
      if (id) {
        const updated = items.map((item) => item.id === id ? { ...item, title, description } : item);
        saveDemoAnnouncements(updated);
        setFeedback(announcementFeedback, "Announcement updated successfully in demo mode.", "success");
      } else {
        items.push({
          id: `demo-${Date.now()}`,
          title,
          description,
          createdAt: Date.now()
        });
        saveDemoAnnouncements(items);
        setFeedback(announcementFeedback, "Announcement published successfully in demo mode.", "success");
      }
      resetAnnouncementForm();
      renderDemoAdminAnnouncements();
      return;
    }

    try {
      if (id) {
        await updateDoc(doc(announcementsRef, id), {
          title,
          description
        });
        setFeedback(announcementFeedback, "Announcement updated successfully.", "success");
      } else {
        await addDoc(announcementsRef, {
          title,
          description,
          createdAt: serverTimestamp()
        });
        setFeedback(announcementFeedback, "Announcement published successfully.", "success");
      }
      resetAnnouncementForm();
    } catch (error) {
      setFeedback(announcementFeedback, error.message, "error");
    }
  });

  adminJobForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = adminJobForm.jobId.value.trim();
    const title = adminJobForm.jobTitle.value.trim();
    const description = adminJobForm.jobDescription.value.trim();

    if (!id || !title || !description) {
      setFeedback(adminJobFeedback, "Select a job and enter both title and description.", "error");
      return;
    }

    if (getDemoSession() || !isFirebaseConfigured) {
      const updated = normalizeJobs(readJobs()).map((item) => item.id === id ? { ...item, title, description } : item);
      saveJobs(updated);
      setFeedback(adminJobFeedback, "Job updated successfully in demo mode.", "success");
      renderDemoJobs();
      return;
    }

    try {
      await updateDoc(doc(jobsRef, id), { title, description });
      setFeedback(adminJobFeedback, "Job updated successfully.", "success");
    } catch (error) {
      setFeedback(adminJobFeedback, error.message, "error");
    }
  });

  async function hydratePrayerFormFromSource() {
    if (getDemoSession() || !isFirebaseConfigured) {
      const prayerData = getDemoPrayerTimings();
      prayerForm.fajr.value = prayerData.fajr || "";
      prayerForm.zuhr.value = prayerData.zuhr || "";
      prayerForm.asr.value = prayerData.asr || "";
      prayerForm.maghrib.value = prayerData.maghrib || "";
      prayerForm.isha.value = prayerData.isha || "";
      prayerForm.jumuah.value = prayerData.jumuah || "";
      return;
    }

    const prayerSnapshot = await getDoc(prayerTimingsRef);
    if (prayerSnapshot.exists()) {
      const prayerData = prayerSnapshot.data();
      prayerForm.fajr.value = prayerData.fajr || "";
      prayerForm.zuhr.value = prayerData.zuhr || "";
      prayerForm.asr.value = prayerData.asr || "";
      prayerForm.maghrib.value = prayerData.maghrib || "";
      prayerForm.isha.value = prayerData.isha || "";
      prayerForm.jumuah.value = prayerData.jumuah || "";
    }
  }

  function renderDemoAdminAnnouncements() {
    const items = getDemoAnnouncements().sort((a, b) => b.createdAt - a.createdAt);
    adminAnnouncementList.innerHTML = items.length
      ? items.map((item) => `
          <article class="admin-list-item">
            <div>
              <h3>${escapeHtml(item.title || "Untitled announcement")}</h3>
              <p>${escapeHtml(item.description || "")}</p>
            </div>
            <div class="admin-list-meta">
              <span class="meta-chip">${escapeHtml(formatAnnouncementDate(item.createdAt))}</span>
              <span class="meta-chip">ID: ${item.id}</span>
            </div>
            <div class="admin-list-actions">
              <button type="button" class="btn btn-outline" data-action="edit" data-id="${item.id}">Edit</button>
              <button type="button" class="btn btn-primary" data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </article>
        `).join("")
      : `
        <div class="empty-state">
          <h3>No announcements created yet</h3>
          <p>Use the announcement form to publish the first update.</p>
        </div>
      `;
  }

  function renderJobCards(items, target, emptyMessage, allowApprove) {
    if (!items.length) {
      target.innerHTML = `
        <div class="empty-state">
          <h3>${emptyMessage}</h3>
          <p>No job records to show in this section.</p>
        </div>
      `;
      return;
    }

    target.innerHTML = items.map((item) => `
      <article class="admin-list-item">
        <div>
          <h3>${escapeHtml(item.title || "Untitled job")}</h3>
          <p>${escapeHtml(item.description || "")}</p>
        </div>
        <div class="admin-list-meta">
          <span class="meta-chip">${escapeHtml((item.status || "pending").toUpperCase())}</span>
          <span class="meta-chip">${escapeHtml(formatAnnouncementDate(item.createdAt))}</span>
          <span class="meta-chip">${escapeHtml(item.pdfName || "No PDF")}</span>
        </div>
        <div class="admin-list-actions">
          ${allowApprove ? `<button type="button" class="btn btn-primary" data-job-action="approve" data-id="${item.id}">Approve</button>` : ""}
          <button type="button" class="btn btn-outline" data-job-action="edit" data-id="${item.id}">Edit</button>
          <button type="button" class="btn btn-outline" data-job-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </article>
    `).join("");
  }

  function renderDemoJobs() {
    const jobs = normalizeJobs(readJobs()).filter((item) => {
      if (item.status !== "approved") return true;
      return Date.now() - item.createdAt < 2 * 24 * 60 * 60 * 1000;
    }).sort((a, b) => b.createdAt - a.createdAt);
    renderJobCards(jobs.filter((item) => item.status !== "approved"), adminJobPendingList, "No pending jobs", true);
    renderJobCards(jobs.filter((item) => item.status === "approved"), adminJobApprovedList, "No approved jobs", false);
  }

  if (getDemoSession() || !isFirebaseConfigured) {
    authPanel.hidden = getDemoSession();
    dashboard.hidden = !getDemoSession();
    if (headerLogoutButton) headerLogoutButton.hidden = !getDemoSession();
    if (getDemoSession()) {
      adminUserEmail.textContent = `Signed in user: ${DEMO_EMAIL} (demo mode)`;
      hydratePrayerFormFromSource();
      hydrateHijriOverrideForm();
      renderDemoAdminAnnouncements();
      renderDemoJobs();
    }
  }

  adminAnnouncementList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!id) return;

    if (action === "edit") {
      const card = button.closest(".admin-list-item");
      const title = card?.querySelector("h3")?.textContent || "";
      const description = card?.querySelector("p")?.textContent || "";
      announcementForm.announcementId.value = id;
      announcementForm.title.value = title;
      announcementForm.description.value = description;
      submitButton.textContent = "Update Announcement";
      setFeedback(announcementFeedback, "Editing selected announcement.", "success");
      announcementForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete") {
      if (getDemoSession()) {
        const filtered = getDemoAnnouncements().filter((item) => item.id !== id);
        saveDemoAnnouncements(filtered);
        setFeedback(announcementFeedback, "Announcement deleted successfully in demo mode.", "success");
        if (announcementForm.announcementId.value === id) resetAnnouncementForm();
        renderDemoAdminAnnouncements();
        return;
      }

      const confirmed = window.confirm("Delete this announcement?");
      if (!confirmed) return;

      try {
        await deleteDoc(doc(announcementsRef, id));
        setFeedback(announcementFeedback, "Announcement deleted successfully.", "success");
        if (announcementForm.announcementId.value === id) resetAnnouncementForm();
      } catch (error) {
        setFeedback(announcementFeedback, error.message, "error");
      }
    }
  });

  function findJobById(id, items) {
    return items.find((item) => item.id === id);
  }

  function loadJobIntoForm(item) {
    if (!item) return;
    adminJobForm.jobId.value = item.id;
    adminJobForm.jobTitle.value = item.title || "";
    adminJobForm.jobDescription.value = item.description || "";
    adminJobSubmitButton.textContent = "Save Job Changes";
    setFeedback(adminJobFeedback, "Editing selected job.", "success");
    adminJobForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const handleJobAction = async (event) => {
    const button = event.target.closest("button[data-job-action]");
    if (!button) return;

    const action = button.dataset.jobAction;
    const id = button.dataset.id;
    if (!id) return;

    if (getDemoSession() || !isFirebaseConfigured) {
      const items = normalizeJobs(readJobs());
      const selected = findJobById(id, items);

      if (action === "edit") {
        loadJobIntoForm(selected);
        return;
      }

      if (action === "approve") {
        saveJobs(items.map((item) => item.id === id ? { ...item, status: "approved" } : item));
        setFeedback(adminJobFeedback, "Job approved successfully in demo mode.", "success");
        renderDemoJobs();
        return;
      }

      if (action === "delete") {
        saveJobs(items.filter((item) => item.id !== id));
        setFeedback(adminJobFeedback, "Job deleted successfully in demo mode.", "success");
        if (adminJobForm.jobId.value === id) resetAdminJobForm();
        renderDemoJobs();
      }
      return;
    }

    if (action === "edit") {
      const allJobCards = [...adminJobPendingList.querySelectorAll(".admin-list-item"), ...adminJobApprovedList.querySelectorAll(".admin-list-item")];
      const card = allJobCards.find((item) => item.querySelector(`button[data-id="${id}"]`));
      loadJobIntoForm({
        id,
        title: card?.querySelector("h3")?.textContent || "",
        description: card?.querySelector("p")?.textContent || ""
      });
      return;
    }

    try {
      if (action === "approve") {
        await updateDoc(doc(jobsRef, id), { status: "approved" });
        setFeedback(adminJobFeedback, "Job approved successfully.", "success");
        return;
      }

      if (action === "delete") {
        await deleteDoc(doc(jobsRef, id));
        setFeedback(adminJobFeedback, "Job deleted successfully.", "success");
        if (adminJobForm.jobId.value === id) resetAdminJobForm();
      }
    } catch (error) {
      setFeedback(adminJobFeedback, error.message, "error");
    }
  };

  adminJobPendingList?.addEventListener("click", handleJobAction);
  adminJobApprovedList?.addEventListener("click", handleJobAction);

  if (getDemoSession() || !isFirebaseConfigured) {
    renderDemoAdminAnnouncements();
    renderDemoJobs();
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    const isLoggedIn = Boolean(user);
    authPanel.hidden = isLoggedIn;
    dashboard.hidden = !isLoggedIn;
    if (headerLogoutButton) headerLogoutButton.hidden = !isLoggedIn;

    if (!isLoggedIn) {
      adminUserEmail.textContent = "Signed in user: --";
      resetAnnouncementForm();
      resetAdminJobForm();
      return;
    }

    adminUserEmail.textContent = `Signed in user: ${user.email}`;

    try {
      await hydratePrayerFormFromSource();
    } catch (error) {
      setFeedback(prayerFeedback, error.message, "error");
    }
  });

  onSnapshot(announcementsQuery, (snapshot) => {
    if (snapshot.empty) {
      adminAnnouncementList.innerHTML = `
        <div class="empty-state">
          <h3>No announcements created yet</h3>
          <p>Use the announcement form to publish the first update.</p>
        </div>
      `;
      return;
    }

    adminAnnouncementList.innerHTML = snapshot.docs.map((docSnapshot) => {
      const item = docSnapshot.data();
      return `
        <article class="admin-list-item">
          <div>
            <h3>${escapeHtml(item.title || "Untitled announcement")}</h3>
            <p>${escapeHtml(item.description || "")}</p>
          </div>
          <div class="admin-list-meta">
            <span class="meta-chip">${escapeHtml(formatAnnouncementDate(item.createdAt))}</span>
            <span class="meta-chip">ID: ${docSnapshot.id}</span>
          </div>
          <div class="admin-list-actions">
            <button type="button" class="btn btn-outline" data-action="edit" data-id="${docSnapshot.id}">Edit</button>
            <button type="button" class="btn btn-primary" data-action="delete" data-id="${docSnapshot.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  });

  onSnapshot(jobsQuery, (snapshot) => {
    const jobs = snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }));
    const freshJobs = jobs.filter((item) => {
      const createdAt = typeof item.createdAt?.toDate === "function" ? item.createdAt.toDate().getTime() : 0;
      if (item.status !== "approved") return true;
      return Date.now() - createdAt < 2 * 24 * 60 * 60 * 1000;
    });

    renderJobCards(freshJobs.filter((item) => item.status !== "approved"), adminJobPendingList, "No pending jobs", true);
    renderJobCards(freshJobs.filter((item) => item.status === "approved"), adminJobApprovedList, "No approved jobs", false);
  });
}

setupNav();
setupRevealAnimations();
setupHeroClock();
setupHijriEidStatus();
setupPublicPage();
setupAdminPage();
setupJobsPage();
