import { getUserIds, getData, setData } from "./storage.js";
import {
  createBookmark,
  sortReverseChronological,
  incrementLike,
} from "./bookmarks.js";

const userSelect = document.getElementById("userSelect");
const bookmarksSection = document.getElementById("bookmarks");
const form = document.getElementById("bookmarkForm");
const statusEl = document.getElementById("status");

let currentUser = null;

/* ---------------------------
   Helpers for friendly URLs
---------------------------- */
function slugify(text) {
  const base = (text ?? "").toString().trim().toLowerCase();
  const noDiacritics = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = noDiacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug || "bookmark";
}

function getDatePart(createdAt) {
  const iso = createdAt || new Date().toISOString();
  // "YYYY-MM-DD"
  return iso.slice(0, 10);
}

function getShareKey(bookmark) {
  // short stable key, looks nicer than full UUID
  if (bookmark.shareKey) return bookmark.shareKey;
  if (bookmark.id && typeof bookmark.id === "string") return bookmark.id.split("-")[0];
  return Math.random().toString(36).slice(2, 10);
}

function buildAnchor(bookmark) {
  const date = getDatePart(bookmark.createdAt);
  const titleSlug = slugify(bookmark.title).slice(0, 60);
  const key = getShareKey(bookmark);
  // example: 2026-02-21-opera-video-ae448f4e
  return `${date}-${titleSlug}-${key}`;
}

function buildPermalink(anchor) {
  const url = new URL(window.location.href);
  if (currentUser) url.searchParams.set("user", currentUser);
  url.hash = anchor;
  return url.toString();
}

function setUserInUrl(userId) {
  const url = new URL(window.location.href);
  if (userId) url.searchParams.set("user", userId);
  history.replaceState({}, "", url.toString());
}

/* ---------------------------
   Populate dropdown
---------------------------- */
function populateUsers() {
  const users = getUserIds();
  users.forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `User ${id}`;
    userSelect.appendChild(option);
  });
}

populateUsers();

/* ---------------------------
   Auto-select user from URL (shared link)
---------------------------- */
const userFromUrl = new URLSearchParams(window.location.search).get("user");
if (userFromUrl) {
  userSelect.value = userFromUrl;
  currentUser = userFromUrl;
}

/* ---------------------------
   Handle user selection
---------------------------- */
userSelect.addEventListener("change", () => {
  currentUser = userSelect.value;

  // clear hash when switching users (clean UX)
  window.location.hash = "";

  setUserInUrl(currentUser);
  renderBookmarks();
});

/* ---------------------------
   Render bookmarks (list view always)
---------------------------- */
function renderBookmarks() {
  bookmarksSection.innerHTML = "";
  statusEl.textContent = "";

  if (!currentUser) {
    statusEl.textContent = "Please select a user to view bookmarks.";
    return;
  }

  const data = getData(currentUser) || [];
  const bookmarks = sortReverseChronological(data);

  if (bookmarks.length === 0) {
    bookmarksSection.innerHTML = "<p>No bookmarks for this user.</p>";
    return;
  }

  bookmarks.forEach((bookmark) => {
    const anchor = buildAnchor(bookmark);
    const permalink = buildPermalink(anchor);

    const article = document.createElement("article");
    article.id = anchor;

    article.innerHTML = `
      <h3>
        <a href="${bookmark.url}" target="_blank" rel="noopener noreferrer">
          ${bookmark.title}
        </a>
        <small>
          <a href="#${anchor}">#</a>
        </small>
      </h3>

      <p>${bookmark.description}</p>
      <p><small>Created: ${new Date(bookmark.createdAt).toLocaleString()}</small></p>

      <button type="button" data-copy="${bookmark.url}">Copy URL</button>
      <br />
      <button type="button" data-sharelink="${permalink}">Share bookmark</button>

      <button type="button" data-like="${bookmark.id}">❤️ ${bookmark.likes}</button>
    `;

    bookmarksSection.appendChild(article);
  });

  // Scroll to hash target if present
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      target.scrollIntoView();
    } else {
      // Backward compatibility: if old hash looked like #bookmark-<id>
      const old = window.location.hash.match(/^#bookmark-(.+)$/);
      if (old) {
        const oldId = old[1];
        const found = bookmarks.find((b) => b.id === oldId);
        if (found) {
          const newAnchor = buildAnchor(found);
          history.replaceState({}, "", `${window.location.pathname}?user=${currentUser}#${newAnchor}`);
          const newTarget = document.getElementById(newAnchor);
          if (newTarget) newTarget.scrollIntoView();
        }
      }
    }
  }
}

/* first render if user came from URL */
if (currentUser) {
  setUserInUrl(currentUser);
  renderBookmarks();
}

/* re-render when hash changes */
window.addEventListener("hashchange", () => {
  if (currentUser) renderBookmarks();
});

/* ---------------------------
   Add new bookmark
---------------------------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!currentUser) {
    statusEl.textContent = "Please select a user first.";
    return;
  }

  const formData = new FormData(form);

  const newBookmark = createBookmark(
    formData.get("url"),
    formData.get("title"),
    formData.get("description")
  );

  // Add shareKey for nicer URLs (persisted)
  newBookmark.shareKey = getShareKey(newBookmark);

  const existing = getData(currentUser) || [];
  setData(currentUser, [...existing, newBookmark]);

  form.reset();
  statusEl.textContent = "Bookmark added.";
  renderBookmarks();
});

/* ---------------------------
   Copy + Share + Like (event delegation)
---------------------------- */
bookmarksSection.addEventListener("click", (e) => {
  const copyUrl = e.target.dataset.copy;
  const shareLink = e.target.dataset.sharelink;
  const likeId = e.target.dataset.like;

  // Copy original bookmark URL (rubric requirement)
  if (copyUrl) {
    navigator.clipboard
      .writeText(copyUrl)
      .then(() => {
        statusEl.textContent = "Bookmark URL copied.";
      })
      .catch(() => {
        statusEl.textContent = "Could not copy bookmark URL.";
      });
    return;
  }

  // Share bookmark = copy FRIENDLY permalink to THIS CARD
  if (shareLink) {
    navigator.clipboard
      .writeText(shareLink)
      .then(() => {
        statusEl.textContent = "Card link copied (share this link).";
      })
      .catch(() => {
        statusEl.textContent = "Could not copy card link.";
      });
    return;
  }

  // Like (persisted)
  if (likeId) {
    const data = getData(currentUser) || [];
    const updated = incrementLike(data, likeId);
    setData(currentUser, updated);
    statusEl.textContent = "Liked!";
    renderBookmarks();
  }
});