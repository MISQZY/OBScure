<div align="center">
  <img src=".github/assets/icon.png" alt="OBScure" width="120" />
  <h1>OBScure</h1>
  <p>A desktop control panel for streamers — interactive overlays, widgets, and OBS Studio integrations.</p>
</div>

<p align="center">
  <a href="https://obscure.misqzy.net"><b>obscure.misqzy.net</b></a>
  ·
  <a href="https://github.com/MISQZY/OBScureWeb">Docs & template gallery</a>
</p>

---

For what OBScure does, how to install it, and how to use it, see the site above — this README only covers working on the app itself.

## Local development

```bash
npm install
npm run dev
```

`electron-vite dev` launches the app with hot reload for the renderer.

Other scripts:

```bash
npm run typecheck
npm run lint
npm run build          # electron-vite build
npm run dist:installer # Windows NSIS installer
npm run dist:portable  # Windows portable build
```

## License

MIT — see [LICENSE](LICENSE).

## Related

- [OBScureWeb](https://github.com/MISQZY/OBScureWeb) — docs, template gallery, and the site itself
- [obscure.misqzy.net](https://obscure.misqzy.net) — the live site
