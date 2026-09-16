import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("./Kazhutha.html", import.meta.url);
const clientPath = new URL("./multiplayer.js", import.meta.url);
const outputDir = new URL("./dist/", import.meta.url);
const outputHtml = new URL("./dist/index.html", import.meta.url);
const outputClient = new URL("./dist/multiplayer.js", import.meta.url);

let html = await readFile(sourcePath, "utf8");

function replaceRequired(search, replacement, description) {
  if (!html.includes(search)) {
    throw new Error(`Could not prepare the hosted build: ${description} was not found.`);
  }
  html = html.replace(search, replacement);
}

replaceRequired(
  "<title>Kazhutha · കഴുത — Downloaded edition</title>",
  "<title>Kazhutha · കഴുത</title>",
  "the downloadable page title",
);

replaceRequired(
  "</style></head>",
  '</style><script src="./multiplayer.js"></script></head>',
  "the closing page styles",
);

replaceRequired(
  "function Ub({standalone:t=!1}){let e=t?D2:O2,",
  "function Ub({standalone:t=!1}){let e=KazhuthaRoomClient.request,",
  "the downloaded-only request handler",
);

replaceRequired(
  '(0,C.jsx)(Pb,{language:a}),(0,C.jsx)("a",{className:"download-html-button",href:"/downloads/Kazhutha.html",download:"Kazhutha.html",children:"Download HTML \\u2193"})',
  "null",
  "the Install app and Download HTML menu options",
);

replaceRequired(
  "Friends sign in with ChatGPT to use online rooms. The game is free of real-money betting.",
  "The game is free of real-money betting.",
  "the sign-in note in the install information",
);

replaceRequired(
  "Each friend opens the invite link on their own device, enters a name, and joins. Friends sign in with ChatGPT, then join using your room code.",
  "Each friend opens the invite link on their own device, enters a name, and joins.",
  "the ChatGPT sign-in sentence in the room lobby",
);

replaceRequired(
  '}var k2=pe(Pt(),1);(0,F2.createRoot)(document.getElementById("root")).render((0,k2.jsx)(Ub,{standalone:!0}));})();',
  '}var KazhuthaRoomClient=window.KazhuthaMultiplayer.createClient({create:R2,play:Tb,resolve:I2,view:Eb,legal:ah,classic:Lc,trump:wb,ai:Rx},D2);var k2=pe(Pt(),1);(0,F2.createRoot)(document.getElementById("root")).render((0,k2.jsx)(Ub,{standalone:!1}));})();',
  "the standalone application startup",
);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(outputHtml, html),
  copyFile(clientPath, outputClient),
]);

console.log("Kazhutha hosted build created in dist/");
