# 📱 WhatsApp Contact Exporter

> A secure, privacy-first Node.js CLI tool and standalone Windows portable executable to extract, normalize, and export unsaved contacts from active WhatsApp Web chats into Google Contacts CSV and vCard (VCF) formats.

[![Continuous Integration](https://github.com/hanzlaahmad/whatsapp-contact-exporter/actions/workflows/ci.yml/badge.svg)](https://github.com/hanzlaahmad/whatsapp-contact-exporter/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0-green.svg)](https://vitest.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-brightgreen.svg)](LICENSE)

---

## 💻 Windows Portable Executable (.exe)

For Windows users who want to run the tool without installing Node.js or npm, a pre-packaged portable **Windows x64 Single Executable Application (SEA)** is available.

### System Requirements
- **OS**: Windows 10 / Windows 11 (x64)
- **Browser**: Google Chrome or Microsoft Edge installed
- **Node.js**: **Not required** (bundled inside standalone binary)

### Running on Windows
1. Download `whatsapp-contact-exporter-windows-x64.exe` from the latest GitHub Release.
2. Open Command Prompt or PowerShell in your download directory and run:
   ```cmd
   whatsapp-contact-exporter-windows-x64.exe -c PK
   ```
3. A Terminal QR code will display. Scan it using WhatsApp on your phone (**Settings** $\rightarrow$ **Linked Devices**).
4. Export files will automatically save to:
   `%APPDATA%\WhatsApp Contact Exporter\exports\`

### Persistent Authentication Data Location
Session credentials and browser cache are stored safely inside your user AppData directory:
- **Auth Data**: `%APPDATA%\WhatsApp Contact Exporter\auth\`
- **Cache Data**: `%APPDATA%\WhatsApp Contact Exporter\cache\`
- **Exports Data**: `%APPDATA%\WhatsApp Contact Exporter\exports\`

### Verifying Executable Integrity (SHA-256)
In PowerShell, verify the SHA-256 hash against `SHA256SUMS.txt`:
```powershell
Get-FileHash whatsapp-contact-exporter-windows-x64.exe -Algorithm SHA256
```

---

## 📌 Purpose & Architecture Overview

When communicating with new clients, leads, or group members on WhatsApp, phone numbers often remain unsaved in your contact list. Managing and organizing these unsaved numbers manually is tedious.

**WhatsApp Contact Exporter** automates the discovery of unsaved contacts directly from active WhatsApp Web chats. It parses numbers into international **E.164 format**, deduplicates records across chats, formats names according to customizable templates, and generates clean CSV/VCF files ready for instant import into Google Contacts, Apple Contacts, or CRM systems.

> [!IMPORTANT]
> **Native Address Book & Operating Model Disclosure**:
> This tool **does not** query or access your physical phone's native device address book directly (e.g. iOS Contacts / Android Contacts API). Instead, it operates strictly through an authenticated **WhatsApp Web** browser session via Puppeteer. Contact classification is established using WhatsApp Web's authoritative internal sync model (`isMyContact`).

---

## ✨ Key Features

- 🔐 **Privacy-First & 100% Read-Only**: Zero messages sent, zero chats modified, zero WhatsApp settings altered.
- 📱 **QR Code Authentication & Local Session Persistence**: Authenticates cleanly via Terminal QR code and persists session state locally under `%APPDATA%\WhatsApp Contact Exporter\auth\`.
- 🔍 **Strict Chat Provenance**: Candidate discovery is strictly restricted to active 1:1 DM chats and enabled Group participant lists. Global memory store entries are rejected.
- 🆔 **Multi-Path Identity Resolution**: Resolves phone numbers from `@c.us` JID prefixes, `@lid` (Linked ID) mapping API (`getContactLidAndPhone`), and validated contact numbers.
- 🏷️ **Authoritative 4-State Classifier**:
  - `SAVED`: Contact is confirmed saved in WhatsApp contact store (`isMyContact === true`).
  - `UNSAVED`: Contact is un-saved (`isMyContact === false`).
  - `UNCERTAIN`: Metadata sync incomplete or conflicting state.
  - `UNRESOLVED`: Candidate lacks accessible telephone digits.
- 🌐 **E.164 International Normalization**: Validates numbers using `libphonenumber-js` with automatic country code detection.
- 🎨 **Customizable Contact Naming Engine**:
  - `pushname_or_number`: Prefers profile display name (e.g., `WA Unsaved - Alex`), fallback to E.164 number.
  - `full_number`: Uses full E.164 number (e.g., `WA Unsaved - +923001234567`).
  - `last4`: Uses last 4 digits (e.g., `WA Unsaved - 4567`).
  - `counter`: Sequential zero-padded index (e.g., `Client - 001`, `Client - 002`).
- 📁 **Dual Format Exporter**: Generates RFC 4180 CSV with UTF-8 BOM (`\uFEFF`) for Google Contacts, and standard vCard 3.0 (VCF) files.

---

## 🛠️ Architecture & Data Pipeline

```
  WhatsApp Web (Puppeteer)
            │
            ▼
┌───────────────────────────────┐
│ Active Chat Scanning Engine   │  (Strict DM Chat & Group Participant Provenance)
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Multi-Path Identity Resolver  │  (JID Prefix -> LID Mapping -> Contact Number)
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Authoritative 4-State         │  (isMyContact === false -> UNSAVED)
│ Contact Classifier            │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ E.164 Normalizer & Deduplicater (libphonenumber-js validation)
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ CSV & VCF File Exporter       │  (Google Contacts & Apple Contacts Compatible)
└───────────────────────────────┘
```

---

## 🚀 Node.js Setup & Developer Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/hanzlaahmadcheema/whatsapp-contact-exporter.git
cd whatsapp-contact-exporter

# Install dependencies
npm install

# Build TypeScript output
npm run build
```

---

## 💻 Usage & Execution Modes

### Mode 1: Interactive Quick Setup Wizard

Run the executable launcher script or npm target:

```bash
./run.sh
# or
npm run export
```

The wizard will guide you through:
1. **Default Country Code** (Default: `PK`)
2. **Include Group Chat participants?** (Default: `n`)
3. **Export Formats** (`csv`, `vcf`, or `both`)
4. **Output Directory** (Default: `%APPDATA%\WhatsApp Contact Exporter\exports\`)
5. **Contact Naming Style** (Pushname, Full Number, Last 4 Digits, or Counter)
6. **Custom Name Prefix / Suffix**

---

### Mode 2: Direct Command Line Interface (CLI)

```bash
# Export unsaved contacts using default settings (PK region)
node dist/cli.js -c PK -o ./exports

# Custom naming prefix, suffix, and counter style
node dist/cli.js -c PK --prefix "Lead " --suffix " - Aug 2026" --name-style counter --no-groups

# Export CSV format only
node dist/cli.js -c PK -f csv -o ./exports
```

#### Available CLI Options

| Flag / Option | Description | Default |
| :--- | :--- | :---: |
| `-c, --country <code` | Default 2-letter ISO country code for phone parsing | `PK` |
| `-f, --format <list...>` | Output export formats (`csv`, `vcf`) | `csv, vcf` |
| `-o, --output <dir>` | Path to save exported CSV/VCF files | AppData `exports/` |
| `--no-groups` | Skip scanning participants in group chats | `false` |
| `--no-headless` | Run Chromium browser in visible window mode | `false` |
| `--sync-wait <ms>` | Waiting time in ms for WhatsApp sync hydration | `3000` |
| `--prefix <text>` | Custom prefix prepended to contact names | `"WA Unsaved - "` |
| `--suffix <text>` | Custom suffix appended to contact names | `""` |
| `--name-style <style>` | Name style (`pushname`, `number`, `last4`, `counter`) | `pushname` |
| `--counter-start <num>`| Starting counter index for `counter` style | `1` |
| `--pad-digits <num>` | Zero-padding length for `counter` style | `3` |

---

## 🔑 Authentication & Session Persistence

1. On launch, a **QR code** will display directly inside your terminal window.
2. Open **WhatsApp** on your phone $\rightarrow$ **Settings** $\rightarrow$ **Linked Devices** $\rightarrow$ **Link a Device**.
3. Scan the terminal QR code.
4. Session credentials are authenticated locally using `LocalAuth` and saved in `%APPDATA%\WhatsApp Contact Exporter\auth\`. Subsequent runs will reuse the saved session without prompting for QR scanning.

---

## 🔒 Security, Privacy & Read-Only Guarantees

- **No Remote Telemetry**: Zero data is sent to external servers or third-party APIs. All processing happens locally on your machine.
- **Local Credentials**: Authentication secrets remain stored strictly in your local AppData directory.
- **Git Safety**: `.wwebjs_auth/`, `.wwebjs_cache/`, `release/`, and `exports/*.csv` are ignored in `.gitignore` to prevent accidental credential or phone number commits.
- **Read-Only Operation**: The scanner only reads conversation headers and participant metadata. It never posts messages, updates statuses, or modifies WhatsApp contact details.

---

## 🛠️ Development & Windows Packaging

```bash
# Run Vitest test suite (20 unit & regression tests)
npm test

# Build TypeScript output
npm run build

# Package standalone Windows x64 executable (release/whatsapp-contact-exporter-windows-x64.exe)
node scripts/build-windows.mjs
```

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
