// Hostinger entry file: starts the Express server (run `npm run build` first to build the frontend).
import("./server/src/index.js").catch((err) => {
  console.error(err);
  process.exit(1);
});
