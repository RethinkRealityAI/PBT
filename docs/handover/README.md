# Client handover pack

- `PBT-Client-Handover.pdf` — the handover document delivered to the client
  (accounts to create, what each service hosts, environment variables,
  transfer vs. rebuild runbook, verification, security checklist, sign-off).
- `handover.html` + `print.css` — the source. Regenerate the PDF with headless
  Chromium after editing:

```
chrome --headless=new --no-pdf-header-footer \
  --print-to-pdf=PBT-Client-Handover.pdf file://$PWD/handover.html
```

The companion admin documentation system (one page per admin-dashboard
section, roles reference, runbooks, troubleshooting, glossary, handover
checklist database) lives in Notion: "PBT Admin Documentation".
