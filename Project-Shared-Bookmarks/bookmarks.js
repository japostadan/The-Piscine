export function createBookmark(url, title, description) {
  return {
    id: crypto.randomUUID(),
    url,
    title,
    description,
    createdAt: new Date().toISOString(),
    likes: 0,
  };
}

export function sortReverseChronological(bookmarks) {
  return [...bookmarks].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
}

export function incrementLike(bookmarks, id) {
  return bookmarks.map((b) => (b.id === id ? { ...b, likes: b.likes + 1 } : b));
}