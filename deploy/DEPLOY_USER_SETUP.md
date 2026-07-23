# DEPLOY_USER_SETUP.md — one-time setup for safe CI/CD (do this before adding `deploy.yml`)

Goal: GitHub Actions gets an SSH key that can do exactly one thing — run
`deploy.sh` — and nothing else, ever, even if that key leaks. It never has
root, never gets an interactive shell, can't port-forward, can't read
files outside what `deploy.sh` touches.

Run the numbered steps on your VPS over SSH using your own normal admin
access (or the hosting provider's web console) — this is the one time you
still use your real access, to set up the restricted one.

## 1. Create the dedicated user

```bash
sudo adduser --disabled-password --gecos "" deploy
```

`--disabled-password` means this account can never log in with a
password — SSH key only, and only the one key you're about to restrict.

## 2. Generate a NEW keypair just for this — don't reuse your personal SSH key

Run this on **your own laptop/phone**, not the server:

```bash
ssh-keygen -t ed25519 -C "github-actions-animehunt-deploy" -f ./animehunt_deploy_key
```

This makes two files: `animehunt_deploy_key` (private — this goes into the
GitHub secret, nowhere else) and `animehunt_deploy_key.pub` (public — this
goes on the server).

## 3. Install the public key on the VPS, force-restricted

```bash
sudo mkdir -p /home/deploy/.ssh
```

Open `/home/deploy/.ssh/authorized_keys` and add **one line** — the
`command=` part is what does the actual restricting:

```
command="/home/deploy/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...paste-the-full-contents-of-animehunt_deploy_key.pub...
```

Then lock down permissions (SSH refuses to use the key otherwise):

```bash
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

**This one line is the actual security boundary.** Whatever command
GitHub Actions sends over this connection — even if someone edits
`deploy.yml` to try to run `rm -rf /` or open a shell — the server ignores
it and runs `/home/deploy/deploy.sh` instead, every time. `no-pty` means
no interactive terminal is ever granted either.

## 4. Give the deploy user its own space, no root needed for normal operation

```bash
sudo mkdir -p /var/www/animehunt-backend
sudo chown -R deploy:deploy /var/www/animehunt-backend

# Clone your repo here as the deploy user (enter this shell once manually
# to set up the initial git remote / first checkout):
sudo -u deploy -H bash
cd /var/www/animehunt-backend
git clone <your-repo-url> .
exit
```

## 5. Install Node under the deploy user's own account (no sudo needed later)

```bash
sudo -u deploy -H bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
npm install -g pm2
exit
```

## 6. Put `deploy.sh` in place and make it executable

Copy this repo's `deploy/deploy.sh` to `/home/deploy/deploy.sh` (note: not
inside the app repo — one level up, next to `.ssh/`, so it survives even
if `git reset --hard` ever touches the app directory):

```bash
sudo cp /var/www/animehunt-backend/deploy/deploy.sh /home/deploy/deploy.sh
sudo chown deploy:deploy /home/deploy/deploy.sh
sudo chmod 700 /home/deploy/deploy.sh
```

## 7. Start the app under PM2 as the deploy user, and survive reboots

```bash
sudo -u deploy -H bash
cd /var/www/animehunt-backend
cp .env.example .env   # then fill in real values
pm2 start ecosystem.config.js
pm2 save
exit

# This last one needs sudo once, to register the boot-time systemd unit —
# it still runs the app AS the deploy user, not as root:
sudo env PATH=$PATH:/home/deploy/.nvm/versions/node/v22.*/bin \
  /home/deploy/.nvm/versions/node/v22.*/lib/node_modules/pm2/bin/pm2 \
  startup systemd -u deploy --hp /home/deploy
# (run whatever exact command that last one prints out)
```

## 8. Add the GitHub secrets

In your repo → Settings → Secrets and variables → Actions:

- `VPS_HOST` — your VPS's IP or domain
- `VPS_SSH_KEY` — the full contents of `animehunt_deploy_key` (the
  **private** key from step 2 — never the `.pub` one)

Delete the private key file from your laptop/phone once it's pasted into
the GitHub secret, or keep it in a password manager — don't leave it
sitting in a Downloads folder.

## 9. Test it

Push a small commit to `main` and watch the Actions tab. Then check on the
server:

```bash
tail -f /home/deploy/deploy.log
pm2 logs animehunt-backend
```

## What this buys you, concretely

If the `VPS_SSH_KEY` GitHub secret ever leaks (repo compromise, a
misconfigured Action, whatever) — the only thing anyone can do with it is
trigger `deploy.sh`, which only pulls your own `main` branch and restarts
your own app. No root shell, no reading `/etc/shadow`, no pivoting to
other services on the box, no port-forwarding out. That's the entire
point of steps 1–3 over just using your normal root/admin key in the
GitHub secret.

