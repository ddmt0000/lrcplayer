const indexHtml = Bun.file("./index.html");

function decodePath(pathname: string): string {
  try { return decodeURIComponent(pathname); }
  catch { return pathname; }
}

const MIME: Record<string, string> = {
  ".mjs": "application/javascript",
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const server = Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodePath(url.pathname);

    // API routes
    if (pathname === "/api/songs") {
      const musicDir = "./assets/music";
      const lrcDir = "./assets/lrc";

      const musicFiles = await Array.fromAsync(
        new Bun.Glob("**/*.mp3").scan(musicDir)
      );
      const lrcFiles = await Array.fromAsync(
        new Bun.Glob("**/*.lrc").scan(lrcDir)
      );

      const songs = musicFiles.map((file) => {
        const name = file.replace(/\.[^.]+$/, "");
        const lrcFile = lrcFiles.find((l) => l.replace(/\.[^.]+$/, "") === name);
        return {
          name,
          music: `/assets/music/${file}`,
          lrc: lrcFile ? `/assets/lrc/${lrcFile}` : null,
        };
      });

      return Response.json(songs);
    }

    // Favicon
    if (pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    // Static assets & root-level files
    const file = Bun.file(`.${pathname}`);
    if (await file.exists()) {
      const ext = pathname.slice(pathname.lastIndexOf("."));
      return new Response(file, {
        headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
      });
    }

    // Serve index.html for root
    if (pathname === "/") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Listening on http://localhost:${server.port}`);
