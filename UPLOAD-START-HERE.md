# Source upload

Extract `PAID-HUSTLE-OS-v3.5.zip`. Upload the **contents of the paid-hustle-os-v3.5 folder** to your repository root, preserving all subfolders and the hidden `.github` workflow. Use Git where possible to preserve the directory structure.

Commit `package-lock.json`; CI uses `npm ci` and Node.js 24. No production `.env` or real data is bundled. Follow `DEPLOY-START-HERE.md` before deploying: the new server functions require the 3.5 migration.
