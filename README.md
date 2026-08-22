# Vaultier

An offline, locally-encrypted credential manager for people who juggle
VPN + app + database credentials per project. Instead of just storing
secrets, each entry can **launch your actual tools** — connect the VPN,
open the app in your browser, and start your DB client already logged
in — from one click.

Everything is stored in a single encrypted file on your machine
(`vault.dat` in the app's user-data folder). Nothing is sent over the
network; the app never talks to anything except the VPN client and DB
client processes it launches for you.

## Features

- **Master-password vault** — AES-256-GCM encryption, key derived with
  scrypt. The master password is never stored; forgetting it means the
  vault cannot be recovered.
- **One entry per "thing you connect to"** — app, VPN, and database
  credentials live together on a single card instead of three separate
  password entries.
- **One-click VPN connect** — automates the Cisco AnyConnect CLI
  (`vpncli.exe`): feeds it your host/username/password, watches the
  live output, and tells you when the tunnel is up.
- **One-click app open** — opens the entry's URL in your default
  browser (after the VPN connects, if one is configured).
- **One-click DB client launch** — spawns your DB tool (Toad, DBeaver,
  SSMS, sqlcmd, sqlplus, mysql, psql, or any custom command) with the
  host/port/database/instance/username/password already filled in.
- **Copy-to-clipboard fields** — every credential field can be revealed
  and copied individually, for tools that don't support automated
  launch.
- **Search, edit, delete** entries; light/dark theme.

## Running the app

```
npm install
npm run dev        # launches the app in development mode
```

Other scripts:

```
npm run build       # production build
npm run start        # preview the production build
npm run typecheck    # type-check main + renderer
```

## First run

1. On first launch you'll be asked to **create a master password**
   (min 8 characters). This encrypts the vault — there is no password
   reset, so store it somewhere safe.
2. On every later launch you'll **unlock** with that same password.
3. Use the **lock icon** in the sidebar at any time to re-lock the
   vault (also happens automatically when the window closes).

## Adding an entry

Click **Add Entry** in the sidebar. The form has four sections:

| Section | What it's for |
|---|---|
| **App Name** | Required. Shown in the sidebar list. |
| **VPN** | Set *VPN Type* to "Cisco AnyConnect" if this app needs a VPN tunnel first, then fill in VPN Host / Username / Password. Leave it on "No VPN required" to skip this step entirely. |
| **Application** | The app's URL and login credentials. |
| **Database** | DB Client, Host, Port, Database, Instance, Username, Password, and the **Launch Command** used to open your DB tool (see below). |

Notes field at the bottom is free text (e.g. ticket links, gotchas).

### The DB launch command

When you pick a **DB Client** from the dropdown, a starter command is
filled in automatically (only if the command box is still empty, so it
never overwrites something you already customized). The command is a
plain string with placeholders that get substituted with your entry's
values when you click **Connect Database**:

```
{host}  {port}  {database}  {instance}  {username}  {password}
```

Example — Oracle via SQL*Plus:
```
sqlplus {username}/{password}@{host}:{port}/{database}
```

Example — SQL Server Management Studio, using a named instance:
```
ssms -S {host}\{instance} -d {database} -U {username} -P {password}
```

**These are starting points, not guarantees.** The exact command-line
flags a tool accepts depend on which version you have installed and
how it's configured (Toad in particular has no universal CLI
"auto-login" switch across versions). Edit the Launch Command field
until it matches what actually works when you run it yourself in a
terminal — after that, the app will run the same thing for you on
each click.

Tick **Open in terminal window** for CLI tools (sqlplus, sqlcmd,
mysql, psql) so you get an interactive session in a console window.
Leave it unticked for GUI tools (Toad, DBeaver, SSMS) so it just
launches the app.

## Using an entry — the button-click workflows

Select an entry in the sidebar to see its detail view. At the top is
a **Quick Actions** panel with the buttons that do the automation:

### "Connect VPN & Open App" (or just "Open App" if no VPN is set)
1. If the entry has a VPN configured, the app launches
   `vpncli.exe connect <host>` and automatically types your username,
   password, and accepts any banner/agreement prompt as they appear.
2. A **VPN log** panel appears so you can watch exactly what the
   Cisco client is saying in real time — useful the first time you set
   up an entry, in case your installed CLI version prompts slightly
   differently than expected.
3. Once connected, the app URL opens in your default browser
   automatically.
4. If nothing needs a VPN, clicking the button just opens the URL.

Use **Disconnect VPN** next to it to tear the tunnel down when you're
done — it runs `vpncli.exe disconnect`.

### "Connect Database"
Runs the entry's **Launch Command** with all placeholders substituted,
either as a background GUI launch or inside a new terminal window
(per the "Open in terminal window" setting). A status line under the
buttons tells you if it launched successfully or what went wrong
(e.g. "command not found" usually means the exe isn't on your PATH —
use the full quoted path instead, like the Toad example in the form).

### Copying credentials manually
Every field in the VPN / Application / Database sections has its own
copy button (and a reveal/hide toggle for secrets), for the times you
just need to paste a value into a prompt the automation doesn't cover.

## Settings

Click the **gear icon** in the sidebar to set the path to your
`vpncli.exe` (defaults to the standard Cisco AnyConnect install
location on Windows). This is the only global setting — everything
else lives per-entry.

## Where your data lives

- Vault: `<user-data>/vault.dat` — encrypted, unreadable without your
  master password.
- Settings: `<user-data>/settings.json` — just the VPN CLI path, not
  encrypted (contains no secrets).

On Windows, `<user-data>` is typically
`%APPDATA%\credentials-manager`.

## Security notes

- The master password is held in memory only for the unlocked session
  and is wiped on lock/close.
- VPN and DB passwords are written to the target process's stdin or
  argv/environment only at the moment you click a launch button —
  they are not logged anywhere the app controls. Be aware some CLI
  tools (e.g. mysql's `-p<password>`) put the password directly on
  the command line, which can be visible to other processes on the
  same machine while the command runs — this is inherent to that
  tool's CLI, not something Vaultier adds.
