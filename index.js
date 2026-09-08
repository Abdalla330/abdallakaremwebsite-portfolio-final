require("dotenv").config();
require("reflect-metadata");

const express = require("express");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { DataSource, EntitySchema } = require("typeorm");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const app = express();
const port = Number(process.env.PORT || 8080);
const STATIC_DIR = path.join(__dirname, "static");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(STATIC_DIR, { maxAge: "1d" }));

function cleanDbHost(value) {
  return String(value || "localhost")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .split("/")[0];
}

const dbHost = cleanDbHost(process.env.DB_HOST);
const dbPort = Number(process.env.DB_PORT || 5432);
const dbName = process.env.DB_NAME || "abdalla_dc_website";
const isRemoteDatabase = dbHost !== "localhost" && dbHost !== "127.0.0.1";

function databaseSsl() {
  if (!isRemoteDatabase) return false;
  const bundlePath = path.join(__dirname, "global-bundle.pem");
  if (!fs.existsSync(bundlePath)) return { rejectUnauthorized: true };
  return {
    ca: fs.readFileSync(bundlePath, "utf8"),
    rejectUnauthorized: true
  };
}

const ContactEntity = new EntitySchema({
  name: "ContactMessage",
  tableName: "contact_messages",
  columns: {
    id: { primary: true, type: "int", generated: true },
    name: { type: "varchar", length: 120 },
    email: { type: "varchar", length: 180 },
    message: { type: "text" },
    createdAt: { type: "timestamp", createDate: true }
  }
});

const AppDataSource = new DataSource({
  type: "postgres",
  host: dbHost,
  port: dbPort,
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "postgres",
  database: dbName,
  ssl: databaseSsl(),
  synchronize: true,
  logging: false,
  entities: [ContactEntity]
});

async function ensureDatabaseExists() {
  const client = new Client({
    host: dbHost,
    port: dbPort,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || "postgres",
    database: "postgres",
    ssl: databaseSsl()
  });

  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName]
  );

  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
    console.log(`Database ${dbName} created.`);
  } else {
    console.log(`Database ${dbName} already exists.`);
  }

  await client.end();
}

function buildS3Client() {
  const config = { region: process.env.S3_REGION || "us-east-1" };

  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY
    };
  }

  return new S3Client(config);
}

async function uploadStaticFilesToS3() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;

  if (!bucket || !region) {
    console.log("S3 not configured, using local static assets.");
    return;
  }

  const s3Client = buildS3Client();
  const files = fs.readdirSync(STATIC_DIR).filter((name) => {
    return fs.statSync(path.join(STATIC_DIR, name)).isFile();
  });

  for (const file of files) {
    const filePath = path.join(STATIC_DIR, file);
    const contentType = file.endsWith(".png")
      ? "image/png"
      : file.endsWith(".jpg") || file.endsWith(".jpeg")
        ? "image/jpeg"
        : "application/octet-stream";

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: file,
        Body: fs.createReadStream(filePath),
        ContentType: contentType
      }
    });

    await upload.done();
  }

  console.log(`Uploaded ${files.length} static assets to S3.`);
}

function icon(type) {
  const icons = {
    server: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01M11 7h6M11 17h6"/></svg>',
    database: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 19h11a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.5A3.75 3.75 0 0 0 6.5 19Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
    network: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M12 11.5 5 15.5M12 11.5l7 4"/></svg>',
    container: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>'
  };
  return icons[type] || icons.server;
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Portfolio of Abdullahi Mohamed Karim , Data Center and IT Infrastructure Professional working across servers, databases, cloud, data collection systems and infrastructure deployment.">
  <title>${title}</title>
  <style>
    :root {
      --navy: #082a4f;
      --navy2: #0d3d72;
      --blue: #1687ff;
      --blue2: #4ca5ff;
      --ink: #10243d;
      --muted: #66778a;
      --line: #dce7f2;
      --soft: #f5f9fd;
      --white: #ffffff;
      --success: #0b7f5f;
      --shadow: 0 16px 40px rgba(13, 48, 84, .10);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#fff; line-height:1.6; }
    body.menu-open { overflow:hidden; }
    a { color:inherit; text-decoration:none; }
    img { display:block; width:100%; }
    button, input, textarea { font:inherit; }
    .wrap { width:min(1180px, calc(100% - 36px)); margin:0 auto; }
    .eyebrow { color:var(--blue); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:800; }
    .section-title { margin:7px 0 10px; font-size:clamp(31px,4vw,48px); line-height:1.08; letter-spacing:-.025em; }
    .section-copy { color:var(--muted); max-width:720px; font-size:16px; }

    nav { position:sticky; top:0; z-index:50; background:rgba(7,38,73,.97); color:#fff; box-shadow:0 4px 16px rgba(0,0,0,.10); }
    .nav-inner { min-height:72px; display:flex; align-items:center; justify-content:space-between; gap:26px; }
    .brand strong { display:block; font-size:18px; line-height:1.1; }
    .brand span { display:block; color:#bdd8f3; font-size:12px; margin-top:4px; }
    .nav-links { display:flex; align-items:center; gap:25px; font-size:14px; }
    .nav-links a { color:#d8e9f8; transition:.2s; }
    .nav-links a:hover { color:#fff; }
    .nav-cta { background:var(--blue); color:#fff !important; padding:11px 17px; border-radius:8px; font-weight:800; box-shadow:0 8px 20px rgba(22,135,255,.25); }
    .menu-btn { display:none; width:44px; height:44px; border:1px solid rgba(255,255,255,.2); border-radius:9px; background:transparent; color:#fff; font-size:24px; }

    .hero { position:relative; overflow:hidden; background:linear-gradient(110deg,#f7fbff 0%,#f7fbff 54%,#eaf5ff 54%,#eaf5ff 100%); }
    .hero-grid { min-height:615px; display:grid; grid-template-columns:1.05fr .82fr .28fr; align-items:stretch; }
    .hero-copy { padding:82px 42px 70px 0; display:flex; flex-direction:column; justify-content:center; }
    .hero h1 { margin:12px 0 12px; font-size:clamp(48px,6.6vw,82px); line-height:.95; letter-spacing:-.045em; color:#0a2b54; }
    .hero-role { font-size:clamp(20px,2vw,29px); color:var(--blue); font-weight:800; margin-bottom:14px; }
    .hero-skills { color:#36536e; max-width:760px; font-weight:600; }
    .hero-actions { display:flex; gap:13px; flex-wrap:wrap; margin-top:29px; }
    .btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; padding:13px 20px; border-radius:8px; font-weight:800; border:1px solid var(--blue); transition:.2s; }
    .btn.primary { background:var(--blue); color:#fff; box-shadow:0 10px 24px rgba(22,135,255,.22); }
    .btn.secondary { background:#fff; color:#0c467d; }
    .btn:hover { transform:translateY(-2px); }
    .hero-photo { min-height:615px; position:relative; overflow:hidden; }
    .hero-photo img { height:100%; object-fit:cover; object-position:center 36%; }
    .hero-photo:after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,rgba(235,246,255,.55),transparent 28%); pointer-events:none; }
    .hero-side { color:#fff; background:linear-gradient(180deg,#0d477f,#092d57); padding:58px 22px 34px; display:flex; flex-direction:column; justify-content:space-between; }
    .side-feature { display:flex; gap:11px; align-items:flex-start; margin-bottom:25px; font-size:13px; font-weight:700; }
    .side-feature svg { width:25px; flex:0 0 25px; stroke:#4faaff; fill:none; stroke-width:1.8; }
    .side-quote { border-top:2px solid var(--blue); padding-top:17px; color:#dcecff; font-size:14px; font-style:italic; }

    .capabilities { background:#fff; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
    .cap-grid { display:grid; grid-template-columns:repeat(6,1fr); }
    .cap { text-align:center; padding:25px 12px; border-right:1px solid var(--line); font-weight:800; font-size:13px; color:#173d65; }
    .cap:first-child { border-left:1px solid var(--line); }
    .cap svg { width:33px; height:33px; margin:0 auto 11px; stroke:#1466b9; fill:none; stroke-width:1.7; }

    section { padding:82px 0; }
    .about { background:#fff; }
    .about-grid { display:grid; grid-template-columns:1.15fr .82fr; gap:55px; align-items:center; }
    .about-copy p { color:var(--muted); }
    .about-points { display:grid; grid-template-columns:1fr 1fr; gap:12px 24px; margin-top:24px; }
    .about-point { display:flex; gap:10px; color:#244764; font-weight:700; font-size:14px; }
    .about-point:before { content:"✓"; color:var(--blue); font-weight:900; }
    .about-card { display:grid; grid-template-columns:.9fr 1fr; background:var(--soft); border:1px solid var(--line); border-radius:16px; overflow:hidden; box-shadow:var(--shadow); }
    .about-card img { height:100%; object-fit:cover; min-height:340px; }
    .about-meta { padding:28px 24px; display:flex; flex-direction:column; justify-content:center; }
    .about-meta h3 { margin:0 0 5px; font-size:22px; }
    .about-meta p { margin:3px 0; color:#58708a; font-size:14px; }
    .about-quote { margin-top:22px; padding:17px 0 0; border-top:1px solid #cfe0ef; color:#173e68; font-weight:800; }

    .timeline-section { background:linear-gradient(180deg,#f6faff,#edf6ff); }
    .timeline { position:relative; display:grid; grid-template-columns:repeat(5,1fr); gap:26px; margin-top:42px; }
    .timeline:before { content:""; position:absolute; left:4%; right:4%; top:15px; height:2px; background:#9dccfb; }
    .year { position:relative; padding-top:40px; }
    .year:before { content:""; position:absolute; top:8px; left:0; width:15px; height:15px; border-radius:50%; background:var(--blue); border:4px solid #d9ecff; box-shadow:0 0 0 2px var(--blue); }
    .year strong { color:#1479df; font-size:18px; }
    .year h3 { font-size:15px; margin:8px 0 5px; line-height:1.3; }
    .year p { color:#65798f; font-size:13px; margin:0; }

    .projects { background:#fff; }
    .section-heading-row { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }
    .outline-link { display:inline-flex; align-items:center; justify-content:center; padding:10px 17px; border:1px solid var(--blue); border-radius:999px; color:#086fd4; font-size:13px; font-weight:800; white-space:nowrap; background:#fff; }
    .outline-link:hover { background:#eff7ff; }
    .project-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin-top:30px; }
    .project { border:1px solid var(--line); border-radius:14px; overflow:hidden; background:#fff; box-shadow:0 10px 25px rgba(15,62,105,.07); transition:.25s; }
    .project:hover { transform:translateY(-5px); box-shadow:0 18px 35px rgba(15,62,105,.13); }
    .project-image { height:140px; overflow:hidden; background:#e9f3fb; }
    .project-image img { height:100%; object-fit:cover; transition:.35s; }
    .project:hover .project-image img { transform:scale(1.035); }
    .project-visual { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:13px; padding:22px; text-align:center; color:#fff; }
    .project-visual svg { width:56px; height:56px; stroke:currentColor; fill:none; stroke-width:1.55; }
    .project-visual strong { font-size:16px; line-height:1.2; }
    .project-visual small { font-size:11px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; opacity:.88; }
    .visual-census { background:linear-gradient(135deg,#123e6b,#176db7); }
    .visual-security { background:linear-gradient(135deg,#173b5f,#0d7b75); }
    .visual-aws { background:linear-gradient(135deg,#102f58,#185f9f); }
    .visual-data { background:linear-gradient(135deg,#245077,#386fa5); }
    .project-body { padding:15px 15px 14px; }
    .project h3 { margin:0 0 7px; font-size:16px; line-height:1.25; }
    .project p { color:var(--muted); font-size:13px; line-height:1.45; margin:0 0 13px; }
    .tags { display:flex; flex-wrap:wrap; gap:7px; }
    .tag { background:#eaf5ff; color:#0b6cca; padding:6px 9px; font-size:11px; font-weight:800; border-radius:999px; }

    .gallery-section { background:var(--soft); }
    .gallery { display:grid; grid-template-columns:repeat(6,1fr); gap:14px; margin-top:24px; }
    .gallery-item { position:relative; height:165px; overflow:hidden; border-radius:8px; cursor:pointer; border:1px solid #d5e4f1; background:#dfeaf3; box-shadow:0 8px 18px rgba(15,62,105,.06); }
    .gallery-item img { height:100%; object-fit:cover; transition:.3s; }
    .gallery-item:hover img { transform:scale(1.045); }
    .gallery-label { position:absolute; left:0; right:0; bottom:0; padding:34px 14px 12px; color:#fff; font-weight:800; font-size:13px; background:linear-gradient(transparent,rgba(5,34,61,.9)); }

    .tech { background:#fff; }
    .tech-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:12px; margin-top:30px; }
    .tech-item { min-height:112px; border:1px solid var(--line); border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; text-align:center; font-weight:800; font-size:12px; color:#204669; background:#fff; }
    .tech-icon { width:43px; height:43px; display:grid; place-items:center; border-radius:12px; background:#eaf5ff; color:#0d76d6; font-weight:900; font-size:16px; }

    .contact { background:linear-gradient(135deg,#082a4f,#0d416f); color:#fff; }
    .contact-grid { display:grid; grid-template-columns:.9fr 1.1fr; gap:55px; align-items:start; }
    .contact .eyebrow { color:#7cc0ff; }
    .contact .section-title { color:#fff; }
    .contact .section-copy { color:#c9dced; }
    .contact-card { background:#fff; color:var(--ink); border-radius:16px; padding:26px; box-shadow:0 18px 40px rgba(0,0,0,.16); }
    form { display:grid; gap:14px; }
    label { font-size:13px; font-weight:800; color:#31516e; }
    input, textarea { width:100%; margin-top:6px; padding:13px 14px; border:1px solid #cdddea; border-radius:8px; background:#f9fcff; color:#10243d; outline:none; }
    input:focus, textarea:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(22,135,255,.10); }
    textarea { min-height:135px; resize:vertical; }
    .submit { border:0; cursor:pointer; }
    .notice { background:#e9fff8; color:var(--success); border:1px solid #a8e3d0; padding:12px 14px; border-radius:8px; font-weight:800; margin-bottom:16px; }

    footer { background:#061f3a; color:#bcd0e3; padding:26px 0; font-size:13px; }
    .footer-inner { display:flex; justify-content:space-between; gap:20px; align-items:center; }
    .footer-inner strong { color:#fff; }

    .lightbox { display:none; position:fixed; inset:0; z-index:100; background:rgba(2,17,31,.94); padding:40px; align-items:center; justify-content:center; }
    .lightbox.open { display:flex; }
    .lightbox img { max-width:min(1200px,94vw); max-height:86vh; object-fit:contain; border-radius:10px; width:auto; }
    .lightbox button { position:absolute; top:18px; right:24px; width:46px; height:46px; border-radius:50%; border:1px solid rgba(255,255,255,.3); background:rgba(255,255,255,.08); color:#fff; font-size:25px; cursor:pointer; }

    @media (max-width: 1040px) {
      .hero-grid { grid-template-columns:1fr .72fr; }
      .hero-side { display:none; }
      .cap-grid { grid-template-columns:repeat(3,1fr); }
      .project-grid { grid-template-columns:repeat(2,1fr); }
      .tech-grid { grid-template-columns:repeat(4,1fr); }
      .gallery { grid-template-columns:repeat(3,1fr); }
      .timeline { grid-template-columns:1fr 1fr; }
      .timeline:before { display:none; }
      .year { padding-top:25px; }
    }
    @media (max-width: 820px) {
      .menu-btn { display:block; }
      .nav-links { display:none; position:fixed; top:72px; left:0; right:0; bottom:0; background:#082a4f; padding:30px 24px; flex-direction:column; align-items:flex-start; font-size:18px; }
      .nav-links.open { display:flex; }
      .nav-cta { width:100%; text-align:center; }
      .hero-grid { display:block; }
      .hero-copy { padding:66px 0 38px; }
      .hero-photo { min-height:430px; }
      .about-grid, .contact-grid { grid-template-columns:1fr; }
      .about-card { max-width:650px; }
      .timeline { grid-template-columns:1fr; }
      .project-grid { grid-template-columns:1fr; }
      .project-image { height:260px; }
      .tech-grid { grid-template-columns:repeat(2,1fr); }
      .footer-inner { flex-direction:column; align-items:flex-start; }
    }
    @media (max-width: 540px) {
      .gallery { grid-template-columns:1fr; } /* gallery-mobile */
      .section-heading-row { flex-direction:column; align-items:flex-start; }

      .wrap { width:min(100% - 24px,1180px); }
      section { padding:64px 0; }
      .hero h1 { font-size:48px; }
      .hero-photo { min-height:360px; }
      .cap-grid { grid-template-columns:repeat(2,1fr); }
      .gallery { grid-template-columns:repeat(2,1fr); }
      .gallery-item { height:200px; }
      .about-card { grid-template-columns:1fr; }
      .about-card img { min-height:0; max-height:390px; object-position:center 25%; }
      .about-points { grid-template-columns:1fr; }
      .lightbox { padding:16px; }
    }
  </style>
</head>
<body>
<nav>
  <div class="wrap nav-inner">
    <a class="brand" href="#home"><strong>Abdullahi Mohamed Karim </strong><span>Data Center & IT Infrastructure Professional</span></a>
    <button class="menu-btn" aria-label="Open navigation" onclick="toggleMenu()">☰</button>
    <div class="nav-links" id="navLinks">
      <a href="#home">Home</a>
      <a href="#about">About</a>
      <a href="#experience">Experience</a>
      <a href="#projects">Projects</a>
      <a href="#gallery">Data Center</a>
      <a href="#technologies">Technologies</a>
      <a class="nav-cta" href="#contact">Let's Connect</a>
    </div>
  </div>
</nav>
${body}
<footer>
  <div class="wrap footer-inner">
    <div><strong>Abdullahi Mohamed Karim </strong><br>Data Center, Cloud, Servers, Databases and Data Systems</div>
    <div>Professional IT Infrastructure Portfolio</div>
  </div>
</footer>
<div class="lightbox" id="lightbox" onclick="closeLightbox(event)">
  <button aria-label="Close image" onclick="closeLightbox(event, true)">×</button>
  <img id="lightboxImage" alt="Expanded project photo">
</div>
<script>
  function toggleMenu() {
    const nav = document.getElementById('navLinks');
    nav.classList.toggle('open');
    document.body.classList.toggle('menu-open', nav.classList.contains('open'));
  }
  document.querySelectorAll('#navLinks a').forEach(a => a.addEventListener('click', () => {
    document.getElementById('navLinks').classList.remove('open');
    document.body.classList.remove('menu-open');
  }));
  function openLightbox(src) {
    document.getElementById('lightboxImage').src = src;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox(event, force) {
    if (force || event.target.id === 'lightbox') {
      document.getElementById('lightbox').classList.remove('open');
      document.body.style.overflow = '';
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLightbox({target:{id:'lightbox'}}, true);
  });
</script>
</body>
</html>`;
}

app.get("/", (req, res) => {
  const saved = req.query.sent === "1";
  const body = `
    <header class="hero" id="home">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <div class="eyebrow">Building reliable infrastructure for better data</div>
          <h1>Abdullahi Mohamed Karim </h1>
          <div class="hero-role">Data Center and IT Infrastructure Professional</div>
          <div class="hero-skills">Server Administration &nbsp;•&nbsp; Database Management &nbsp;•&nbsp; Cloud Infrastructure &nbsp;•&nbsp; Data Collection Systems &nbsp;•&nbsp; Docker &nbsp;•&nbsp; PostgreSQL &nbsp;•&nbsp; AWS &nbsp;•&nbsp; Cybersecurity</div>
          <div class="hero-actions">
            <a class="btn primary" href="#projects">View My Work</a>
            <a class="btn secondary" href="#contact">Contact Me</a>
          </div>
        </div>
        <div class="hero-photo"><img src="/static/profile-main.jpg" alt="Abdullahi Mohamed Karim "></div>
        <aside class="hero-side">
          <div>
            <div class="side-feature">${icon("server")}<span>Reliable<br>Infrastructure</span></div>
            <div class="side-feature">${icon("shield")}<span>Secure<br>Data Systems</span></div>
            <div class="side-feature">${icon("cloud")}<span>Cloud<br>Infrastructure</span></div>
            <div class="side-feature">${icon("network")}<span>Data for<br>Development</span></div>
          </div>
          <div class="side-quote">Technology infrastructure that keeps people, systems and data connected.</div>
        </aside>
      </div>
    </header>

    <div class="capabilities">
      <div class="wrap cap-grid">
        <div class="cap">${icon("server")}Server Administration</div>
        <div class="cap">${icon("database")}Database Management</div>
        <div class="cap">${icon("cloud")}Cloud Infrastructure</div>
        <div class="cap">${icon("network")}Data Collection Systems</div>
        <div class="cap">${icon("shield")}Security & Recovery</div>
        <div class="cap">${icon("container")}Docker & Containers</div>
      </div>
    </div>

    <section class="about" id="about">
      <div class="wrap about-grid">
        <div class="about-copy">
          <div class="eyebrow">About Me</div>
          <h2 class="section-title">Passionate about building reliable IT infrastructure</h2>
          <p>I work across data center operations, server administration, database management, cloud infrastructure and large scale data collection platforms. My focus is practical, reliable technology that helps teams collect, protect, process and use data with confidence.</p>
          <p>My experience combines hands on infrastructure work with production system administration, including server racks, network equipment, Windows and Linux servers, PostgreSQL, Survey Solutions, Docker, backup and recovery, and cloud deployment.</p>
          <div class="about-points">
            <div class="about-point">Physical data center infrastructure</div>
            <div class="about-point">Server and database administration</div>
            <div class="about-point">Field and regional deployments</div>
            <div class="about-point">Cloud and container platforms</div>
            <div class="about-point">Data collection infrastructure</div>
            <div class="about-point">Security, backup and recovery</div>
          </div>
        </div>
        <div class="about-card">
          <img src="/static/profile-secondary.jpg" alt="Professional portrait">
          <div class="about-meta">
            <div class="eyebrow">Profile</div>
            <h3>Abdullahi Mohamed Karim </h3>
            <p>Data Center and IT Infrastructure Professional</p>
            <p>Server, database, cloud and data systems</p>
            <div class="about-quote">Reliable systems. Meaningful data. Stronger decisions.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="timeline-section" id="experience">
      <div class="wrap">
        <div class="eyebrow">Work Experience</div>
        <h2 class="section-title">My professional journey</h2>
        <p class="section-copy">A growing portfolio of infrastructure, data systems and field deployment work supporting reliable digital operations.</p>
        <div class="timeline">
          <div class="year"><strong>2022</strong><h3>Joined SNBS</h3><p>Server administration, data center operations and application infrastructure support.</p></div>
          <div class="year"><strong>2023</strong><h3>Infrastructure improvements</h3><p>Expanded support for servers, databases and data collection systems.</p></div>
          <div class="year"><strong>2024</strong><h3>Business Establishment Census</h3><p>Infrastructure, server and database support, Survey Solutions administration, field systems, security and recovery.</p></div>
          <div class="year"><strong>2025</strong><h3>Annual Economic Survey</h3><p>Head of IT Technical Team, leading server infrastructure, Survey Solutions, database operations and technical support for field data collection.</p></div>
          <div class="year"><strong>2026</strong><h3>AWS cloud infrastructure</h3><p>EC2, RDS PostgreSQL, S3, GitHub deployment and modern cloud based application hosting.</p></div>
        </div>
      </div>
    </section>


    <section class="projects" id="projects">
      <div class="wrap">
        <div class="section-heading-row">
          <div>
            <h2 class="section-title">Selected work and achievements</h2>
            <p class="section-copy">Projects that show my experience in data center infrastructure, data collection systems and production system administration.</p>
          </div>
          <a class="outline-link" href="#projects">View all projects →</a>
        </div>

        <div class="project-grid">
          <article class="project">
            <div class="project-image"><img src="/static/project-census.jpg" alt="Business Establishment Census data systems"></div>
            <div class="project-body">
              <h3>Business Establishment Census</h3>
              <p>Infrastructure and technical support for census operations, including servers, databases, Survey Solutions and field data systems.</p>
              <div class="tags"><span class="tag">Census</span><span class="tag">Data Management</span><span class="tag">Infrastructure</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/annual-economic-survey.jpg" alt="Original photo from Annual Economic Survey technical work"></div>
            <div class="project-body">
              <h3>Annual Economic Survey</h3>
              <p><strong>Head of IT Technical Team.</strong> Led server infrastructure, Survey Solutions administration, database operations, field data collection support, synchronization and technical troubleshooting throughout survey operations.</p>
              <div class="tags"><span class="tag">Technical Lead</span><span class="tag">Survey Solutions</span><span class="tag">Servers</span><span class="tag">Database</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/system-admin.jpg" alt="Original photo from Survey Solutions and system administration work"></div>
            <div class="project-body">
              <h3>Survey Solutions Administration</h3>
              <p>Deployment, configuration and administration of Survey Solutions Headquarters, Designer and Interviewer environments.</p>
              <div class="tags"><span class="tag">Survey Solutions</span><span class="tag">Administration</span><span class="tag">Support</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/project-server-database.jpg" alt="Server and database monitoring"></div>
            <div class="project-body">
              <h3>Server and Database Support</h3>
              <p>Administration and maintenance of Windows Server environments, PostgreSQL databases, application hosting and system monitoring.</p>
              <div class="tags"><span class="tag">Servers</span><span class="tag">PostgreSQL</span><span class="tag">System Admin</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/project-security-recovery.jpg" alt="Security and recovery"></div>
            <div class="project-body">
              <h3>Security and Recovery Work</h3>
              <p>Server security response, system restoration, data recovery and backup improvements to maintain availability of critical systems.</p>
              <div class="tags"><span class="tag">Security</span><span class="tag">Backup</span><span class="tag">Disaster Recovery</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/project-regional-datacenter.jpg" alt="Regional data center setup"></div>
            <div class="project-body">
              <h3>Regional Data Center Setup</h3>
              <p>Field deployment to regional states to establish and improve data center infrastructure, including racks, networking equipment and servers.</p>
              <div class="tags"><span class="tag">Infrastructure</span><span class="tag">Networking</span><span class="tag">Deployment</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/field-support.jpg" alt="Original photo from rack installation and field support work"></div>
            <div class="project-body">
              <h3>Rack Installation in the Field</h3>
              <p>Hands-on assembly, installation and configuration of server racks, switches, routers, servers and UPS equipment during regional assignments.</p>
              <div class="tags"><span class="tag">Rack Installation</span><span class="tag">Field Work</span><span class="tag">Hardware</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/project-aws-cloud.jpg" alt="AWS cloud deployment"></div>
            <div class="project-body">
              <h3>AWS Cloud Deployment</h3>
              <p>Deployment of cloud infrastructure using AWS EC2, Amazon RDS PostgreSQL, S3, GitHub, Node.js and PM2 for application hosting.</p>
              <div class="tags"><span class="tag">AWS</span><span class="tag">Cloud Infrastructure</span><span class="tag">Deployment</span></div>
            </div>
          </article>

          <article class="project">
            <div class="project-image"><img src="/static/project-data-collection.jpg" alt="Data collection systems support"></div>
            <div class="project-body">
              <h3>Data Collection Systems Support</h3>
              <p>Technical support for CAPI and CAWI data collection, field synchronization, assignment management and centralized processing.</p>
              <div class="tags"><span class="tag">CAPI</span><span class="tag">CAWI</span><span class="tag">Data Processing</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="gallery-section" id="gallery">
      <div class="wrap">
        <div class="section-heading-row">
          <div>
            <div class="eyebrow">Data Center and Field Work</div>
            <h2 class="section-title">Photo gallery</h2>
            <p class="section-copy">Real photos from infrastructure setup, field support, rack deployment and system administration work.</p>
          </div>
          <a class="outline-link" href="#gallery">View all photos →</a>
        </div>

        <div class="gallery">
          <div class="gallery-item" onclick="openLightbox('/static/rack-build.jpg')"><img src="/static/rack-build.jpg" alt="Server rack preparation"><div class="gallery-label">Server rack preparation</div></div>
          <div class="gallery-item" onclick="openLightbox('/static/rack-final.jpg')"><img src="/static/rack-final.jpg" alt="Rack installation in the field"><div class="gallery-label">Rack installation in the field</div></div>
          <div class="gallery-item" onclick="openLightbox('/static/field-support.jpg')"><img src="/static/field-support.jpg" alt="System configuration"><div class="gallery-label">System configuration</div></div>
          <div class="gallery-item" onclick="openLightbox('/static/data-center-room.jpg')"><img src="/static/data-center-room.jpg" alt="Completed rack setup"><div class="gallery-label">Completed rack setup</div></div>
          <div class="gallery-item" onclick="openLightbox('/static/workstation.jpg')"><img src="/static/workstation.jpg" alt="Server monitoring"><div class="gallery-label">Server monitoring</div></div>
          <div class="gallery-item" onclick="openLightbox('/static/system-admin.jpg')"><img src="/static/system-admin.jpg" alt="Survey Solutions administration"><div class="gallery-label">Survey Solutions administration</div></div>
        </div>
      </div>
    </section>

    <section class="tech" id="technologies">
      <div class="wrap">
        <div class="eyebrow">Technologies and Tools</div>
        <h2 class="section-title">Technologies I work with</h2>
        <div class="tech-grid">
          <div class="tech-item"><div class="tech-icon">WS</div>Windows Server</div>
          <div class="tech-item"><div class="tech-icon">LNX</div>Linux</div>
          <div class="tech-item"><div class="tech-icon">PG</div>PostgreSQL</div>
          <div class="tech-item"><div class="tech-icon">AWS</div>Amazon Web Services</div>
          <div class="tech-item"><div class="tech-icon">DKR</div>Docker</div>
          <div class="tech-item"><div class="tech-icon">NET</div>Networking</div>
          <div class="tech-item"><div class="tech-icon">SEC</div>Security & Recovery</div>
          <div class="tech-item"><div class="tech-icon">SS</div>Survey Solutions</div>
        </div>
      </div>
    </section>

    <section class="contact" id="contact">
      <div class="wrap contact-grid">
        <div>
          <div class="eyebrow">Let's Work Together</div>
          <h2 class="section-title">Have a project or opportunity in mind?</h2>
          <p class="section-copy">I am open to professional opportunities, collaborations and conversations about data center infrastructure, servers, databases, cloud systems and data platforms.</p>
        </div>
        <div class="contact-card">
          ${saved ? '<div class="notice">Thank you, your message was saved successfully.</div>' : ''}
          <form method="POST" action="/contact">
            <label>Name<input name="name" maxlength="120" required></label>
            <label>Email<input name="email" type="email" maxlength="180" required></label>
            <label>Message<textarea name="message" maxlength="2000" required></textarea></label>
            <button class="btn primary submit" type="submit">Send Message</button>
          </form>
        </div>
      </div>
    </section>`;

  res.send(page("Abdullahi Mohamed Karim  | IT Infrastructure Portfolio", body));
});

app.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).send("Missing required fields");

    const repo = AppDataSource.getRepository("ContactMessage");
    await repo.save({
      name: String(name).trim().slice(0, 120),
      email: String(email).trim().slice(0, 180),
      message: String(message).trim().slice(0, 2000)
    });

    res.redirect("/?sent=1#contact");
  } catch (error) {
    console.error("Contact save failed:", error);
    res.status(500).send("Could not save the message. Check the database connection.");
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "abdullahi-it-portfolio" });
});

async function start() {
  try {
    await ensureDatabaseExists();
    await uploadStaticFilesToS3();
    await AppDataSource.initialize();
    console.log("Database connected.");
    app.listen(port, "0.0.0.0", () => {
      console.log(`Website running on port ${port}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

start();
