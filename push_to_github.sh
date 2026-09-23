#!/usr/bin/env bash
# =========================================================
#  Millora - Automated Git Commit and GitHub Push Script
# =========================================================

set -e

# Detect branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "========================================================="
echo " Millora - Automated Git Commit and GitHub Push"
echo " Detected branch: ${CURRENT_BRANCH}"
echo "========================================================="

# Check changes
if [ -z "$(git status --porcelain)" ]; then
    echo "[!] No working tree changes detected."
    echo "[*] Checking for unpushed commits..."
    git log origin/${CURRENT_BRANCH}..${CURRENT_BRANCH} --oneline 2>/dev/null || true
    read -r -p "Push existing commits to origin/${CURRENT_BRANCH}? [y/N]: " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        git push origin "${CURRENT_BRANCH}"
        echo "✅ Pushed to origin/${CURRENT_BRANCH}"
    fi
    exit 0
fi

# Determine commit message
DEFAULT_MSG="feat(scaniq): implement intelligent offline invoice scanner with Stirling/Paperless architecture"

if [ -z "$1" ]; then
    echo ""
    echo "Default commit message:"
    echo "  ${DEFAULT_MSG}"
    echo ""
    read -r -p "Enter commit message (Press Enter for default): " USER_MSG
    COMMIT_MSG="${USER_MSG:-$DEFAULT_MSG}"
else
    COMMIT_MSG="$*"
fi

echo ""
echo "[*] Staging all files..."
git add -A

echo "[*] Committing: \"${COMMIT_MSG}\""
git commit -m "${COMMIT_MSG}"

echo "[*] Pushing to origin/${CURRENT_BRANCH}..."
git push origin "${CURRENT_BRANCH}" || git push -u origin "${CURRENT_BRANCH}"

echo ""
echo "========================================================="
echo " ✅ Changes pushed to GitHub successfully!"
echo "========================================================="
