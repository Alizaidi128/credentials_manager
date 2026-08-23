# Vaultier

An offline, locally-encrypted credential manager for people who juggle VPN + app + database credentials per project. Instead of just storing secrets, each entry can **launch your actual tools** — connect the VPN, open the app in your browser, and start your DB client already logged in — from one click.

Everything is stored in a single encrypted file on your machine (`vault.dat` in the app's user-data folder). Nothing is sent over the network except OTP emails you explicitly trigger; the app never talks to anything except the VPN client and DB client processes it launches for you.

---

## Features

### Vault & Security
- **AES-256-GCM encryption** with scrypt key derivation — your master password never leaves memory and is never stored anywhere
- **Vault lock / unlock** — lock manually via the sidebar lock icon, or the vault locks automatically when the window closes
- **Master password reset via OTP** — if you forget your master password, request a one-time code sent to your configured email address; enter it to set a new password without losing any vault entries
- **Internal recovery key** — a device-bound recovery key is automatically generated at vault creation and stored using the OS-level `safeStorage` API (Windows DPAPI); it is never visible to the user and is used transparently during password reset to decrypt and re-encrypt the vault

### Credential Entries
- **One entry per "thing you connect to"** — VPN, app, and database credentials live together on a single card
- **Multiple apps per entry** — each entry supports multiple app URLs with individual usernames and passwords
- **Copy-to-clipboard with reveal/hide toggle** on every credential field — username, password, VPN credentials, DB credentials
- **Notes field** — free-text per entry (ticket links, gotchas, config notes)
- **Search** — filter entries in the sidebar by name
- **Edit and delete** entries with confirmation dialog

### VPN Automation
- **Cisco AnyConnect** — launches `vpncli.exe connect <host>`, feeds username/password, accepts banner prompts, and reports live output in a log panel
- **Sangfor EasyConnect** — opens the EasyConnect GUI and sends keystrokes to fill in host/username/password automatically; configurable settle time to account for slow-loading login forms
- **Fortinet FortiClient** — automates CLI tunnel connect/disconnect by tunnel name
- **Check Point Endpoint Security** — automates `trac.exe` connect/disconnect with 2FA/OTP support; when the VPN process requests an OTP, a prompt appears in the app and the value is fed back to the process
- **Disconnect VPN** button per VPN type — tears down the active tunnel cleanly
- **Live VPN log panel** — real-time output stream while the VPN process runs

### Database Launch
- **Supported DB clients**: Toad, DBeaver, SSMS, `sqlcmd`, SQL*Plus, MySQL CLI, psql, or any custom command
- **Template command system** — `{host}`, `{port}`, `{database}`, `{instance}`, `{username}`, `{password}` placeholders are substituted at launch time; a sensible default command is pre-filled when you pick a client (only if the field is empty)
- **Terminal vs GUI mode** — tick *Open in terminal window* for interactive CLI tools; leave it unticked for GUI apps

### Settings
- **Per-tool executable paths** — configure the full path to `vpncli.exe`, `EasyConnect.exe`, `FortiClient.exe`, and `trac.exe` globally in Settings, so per-entry forms stay clean
- **EasyConnect settle time** — global wait (ms) before keystrokes are sent to the EasyConnect window
- **Password Reset email** — set your personal email address in Settings; this is where OTP codes are delivered when you use the forgot-password flow
- **SMTP configuration** — host, port, username, password, and from-address for the outgoing email account used to send OTP codes

### UI / UX
- **Light and dark theme** — system-aware by default, with a toggle in the sidebar header and on the unlock screen
- **"Powered by Ali Zaidi"** signature in the sidebar footer
- **Scrollable settings modal** — sticky header and footer with Save/Close buttons always accessible regardless of content length

---

## Running the app

```bash
npm install
npm run dev        # launches the app in development mode
```

Other scripts:

```bash
npm run build       # production build
npm run start       # preview the production build
npm run typecheck   # type-check main + renderer
```

---

## First run

1. On first launch you'll be asked to **create a master password** (min 8 characters). This encrypts the vault.
2. On every later launch you'll **unlock** with that same password.
3. Use the **lock icon** in the sidebar at any time to re-lock the vault (also happens automatically when the window closes).

---

## Adding an entry

Click **Add Entry** in the sidebar. The form has four sections:

| Section | What it's for |
|---|---|
| **App Name** | Required. Shown in the sidebar list. |
| **VPN** | Set *VPN Type* to one of the supported clients if this entry needs a VPN tunnel first, then fill in host / username / password. Leave it on "No VPN required" to skip. |
| **Applications** | One or more app URLs with individual username/password pairs. |
| **Database** | DB client, host, port, database, instance, username, password, launch command, and terminal mode. |

The **Notes** field at the bottom is free text.

### The DB launch command

When you pick a **DB Client** from the dropdown, a starter command is filled in automatically (only if the field is still empty, so it never overwrites your customisations). Placeholders:

```
{host}  {port}  {database}  {instance}  {username}  {password}
```

Example — Oracle via SQL*Plus:
```
sqlplus {username}/{password}@{host}:{port}/{database}
```

Example — SQL Server Management Studio with a named instance:
```
ssms -S {host}\{instance} -d {database} -U {username} -P {password}
```

Tick **Open in terminal window** for CLI tools (sqlplus, sqlcmd, mysql, psql) so you get an interactive session. Leave it unticked for GUI tools (Toad, DBeaver, SSMS).

---

## Using an entry — quick actions

Select an entry in the sidebar to see its detail view. The **Quick Actions** panel at the top has two buttons:

### "Connect VPN & Open App" (or "Open App" if no VPN is set)
1. If the entry has a VPN configured, the app launches the appropriate VPN client and feeds it your credentials.
2. A **live log panel** appears so you can watch output in real time.
3. Once connected, the entry's app URL opens in your default browser.
4. For Check Point tunnels that require 2FA, an OTP input prompt appears in the app.

### "Connect Database"
Runs the entry's launch command with all placeholders substituted, either as a GUI launch or inside a new terminal window. A status line reports success or error.

### Copying credentials manually
Every field in the VPN / Application / Database sections has its own copy button and a reveal/hide toggle — for times when you just need to paste into a prompt the automation doesn't cover.

---

## Password reset (forgot master password)

If you forget your master password:

1. On the unlock screen, click **Forgot password?**
2. Click **Send OTP to my email** — a 6-digit one-time code is emailed to the address configured in Settings (valid for 30 minutes).
3. Enter the code in the app.
4. Set a new master password.

Your vault entries are fully preserved — only the encryption password changes. The email includes the machine name and request time so you can identify unexpected reset attempts.

> **Prerequisite:** you must have set your email address and SMTP credentials in Settings **before** forgetting your password. The vault must also have been created with the current version of the app (so the internal recovery key file exists).

---

## Settings

Click the **gear icon** in the sidebar. Settings are grouped by function:

| Setting | Purpose |
|---|---|
| Cisco AnyConnect CLI Path | Full path to `vpncli.exe` |
| Sangfor EasyConnect Path | Full path to `EasyConnect.exe` |
| EasyConnect Login Settle Time (ms) | Wait after window loads before sending keystrokes (default 10 000 ms) |
| Fortinet FortiClient Path | Full path to `FortiClient.exe` |
| Check Point Endpoint Security Path | Full path to `trac.exe` |
| Your Email Address | Where OTP codes are sent for password reset |
| SMTP Configuration | Host, port, username, password, from-address for sending OTP emails |

---

## Where your data lives

| File | Contents | Encrypted? |
|---|---|---|
| `vault.dat` | All credential entries | Yes — AES-256-GCM, master password required |
| `vault-rk.bin` | Internal recovery key | Yes — OS `safeStorage` (DPAPI on Windows) |
| `settings.json` | Tool paths, SMTP config, user email | No (contains SMTP password — protect accordingly) |
| `otp-request.json` | Pending OTP hash + expiry | No (hash only — the raw code is never stored) |

On Windows, all files are in `%APPDATA%\credentials-manager`.

---

## Security notes

- The master password is held in memory only for the unlocked session and wiped on lock/close.
- The internal recovery key is stored via the OS `safeStorage` API and is tied to the current OS user session — it cannot be read by another user account or copied to another machine.
- VPN and DB passwords are written to the target process's stdin or argv only at the moment you click a launch button — they are not logged anywhere the app controls.
- Be aware that some CLI tools (e.g. `mysql -p<password>`) put the password on the command line, which can be visible to other processes on the same machine while the command runs — this is inherent to that tool's CLI, not something Vaultier adds.
- SMTP credentials are stored unencrypted in `settings.json`. Use a dedicated app-password or relay account rather than your primary email password.

---

*Powered by Ali Zaidi*
