if ("fetch" in window) {
  (async () => {
    const refreshCSS = () => {
      const { head } = document;
      document.querySelectorAll("link").forEach((elem) => {
        const parent = elem.parentElement || head;
        elem.remove();
        const { rel, href } = elem;
        if (
          (href && typeof rel != "string") ||
          rel.length == 0 ||
          rel.toLowerCase() == "stylesheet"
        ) {
          const url = new URL(href);
          url.searchParams.set("_cacheOverride", Date.now() + "");
          elem.href = url.href;
        }
        parent.appendChild(elem);
      });
    };
    const listenForNextEvent = async () => {
      const res = await fetch("/-/awsw-preview/listen.js");
      if (!res.ok) await new Promise((res) => setTimeout(res, 500));
      else {
        const { event } = await res.json();
        if (event === "reload") location.reload();
        else if (event === "css") refreshCSS();
        else alert("Unknown asws-preview event " + event);
      }
    };
    // Constantly query events
    while (1) await listenForNextEvent();
  })();
} else {
  console.error(
    "Upgrade your browser. This Browser is NOT supporting fetch for Live-Reloading."
  );
}
