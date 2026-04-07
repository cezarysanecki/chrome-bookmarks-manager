/**
 * Promise-based wrappers for chrome.bookmarks.* API.
 * Every method rejects with an Error on chrome.runtime.lastError,
 * so callers can use try/catch instead of checking lastError manually.
 */

const wrap = (fn) => (...args) =>
  new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });

export const bookmarksApi = {
  getTree: wrap(chrome.bookmarks.getTree.bind(chrome.bookmarks)),
  create:  wrap(chrome.bookmarks.create.bind(chrome.bookmarks)),
  update:  wrap(chrome.bookmarks.update.bind(chrome.bookmarks)),
  remove:  wrap(chrome.bookmarks.remove.bind(chrome.bookmarks)),
};
