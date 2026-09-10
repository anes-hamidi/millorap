# -*- coding: utf-8 -*-
import os
import re
import asyncio
import aiohttp
from urllib.parse import urljoin

BASE_DZEXAMS = "https://www.dzexams.pro"

LEVELS = [
    "1ap", "2ap", "3ap", "4ap", "5ap",
    "1am", "2am", "3am", "4am", "bem",
    "1as", "2as", "3as", "bac"
]

OUTPUT_DIR = "./dzexams_downloaded_pdfs"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

downloaded_urls = set()

async def download_pdf(session, pdf_url, level, subject, exam_id, semaphore):
    """Downloads a direct PDF if not already on disk."""
    if pdf_url in downloaded_urls:
        return
    downloaded_urls.add(pdf_url)

    save_dir = os.path.join(OUTPUT_DIR, level, subject)
    save_path = os.path.join(save_dir, f"{exam_id}.pdf")

    # Skip files already downloaded
    if os.path.exists(save_path) and os.path.getsize(save_path) > 1000:
        return

    async with semaphore:
        for attempt in range(2):
            try:
                async with session.get(pdf_url, headers=HEADERS, timeout=30, ssl=False) as resp:
                    if resp.status == 200:
                        content_type = resp.headers.get("Content-Type", "").lower()
                        if "pdf" in content_type or pdf_url.endswith(".pdf"):
                            os.makedirs(save_dir, exist_ok=True)
                            content = await resp.read()
                            with open(save_path, 'wb') as f:
                                f.write(content)
                            print(f"[OK] Downloaded [{level}/{subject}] -> {exam_id}.pdf ({len(content) // 1024} KB)")
                            return
            except Exception:
                await asyncio.sleep(1)

async def get_subjects_for_level(session, level):
    """Discovers all subjects for a level, including BEM & BAC ?mod= parameters."""
    subjects = {}
    level_url = f"{BASE_DZEXAMS}/ar/{level}.php"
    try:
        async with session.get(level_url, headers=HEADERS, timeout=15, ssl=False) as resp:
            if resp.status != 200:
                level_url = f"{BASE_DZEXAMS}/ar/{level}"
                async with session.get(level_url, headers=HEADERS, timeout=15, ssl=False) as resp2:
                    if resp2.status != 200:
                        return subjects
                    html = await resp2.text()
            else:
                html = await resp.text()

            # Standard paths (e.g. 1as/math.php, 1ap/math.php)
            path_matches = re.findall(rf'href=["\'](?:/ar/)?({level}/[\w\-]+\.php)["\']', html)
            for m in path_matches:
                subj = m.split('/')[-1].replace('.php', '')
                if subj not in ('home', 'notes', 'youtube', 'advice', 'about-us'):
                    subjects[subj] = f"{BASE_DZEXAMS}/ar/{m}"

            # Query params for BEM & BAC (e.g. bem.php?mod=math, bac.php?mod=math)
            query_matches = re.findall(rf'href=["\'](?:/ar/)?({level}\.php\?mod=[\w\-]+)["\']', html)
            for m in query_matches:
                subj = m.split('mod=')[-1]
                if subj not in ('home', 'notes', 'youtube', 'advice', 'about-us'):
                    subjects[subj] = f"{BASE_DZEXAMS}/ar/{m}"

    except Exception as e:
        print(f"[ERROR] Fetching level {level}: {e}")
    return subjects

async def get_exam_ids_from_subject(session, subject_url):
    """Extracts all exam IDs matching all 4 link formats."""
    exam_ids = set()
    try:
        async with session.get(subject_url, headers=HEADERS, timeout=20, ssl=False) as resp:
            if resp.status == 200:
                html = await resp.text()
                # Matches: /sujet/36697, sujet.php?s=36697, /sujet_bac/393, /sujet_bem/102
                pattern = r'(?:/sujet/|sujet\.php\?s=|/sujet_bac/|/sujet_bem/)(\d+)'
                found_ids = re.findall(pattern, html)
                exam_ids.update(found_ids)
    except Exception as e:
        print(f"[ERROR] Fetching subject {subject_url}: {e}")
    return exam_ids

async def main():
    semaphore = asyncio.Semaphore(12)
    connector = aiohttp.TCPConnector(limit=30, ssl=False)

    async with aiohttp.ClientSession(connector=connector) as session:
        print("Starting download with multi-pattern detection...")
        all_download_tasks = []

        for level in LEVELS:
            subjects = await get_subjects_for_level(session, level)
            print(f"\nLevel [{level}]: Found {len(subjects)} subjects: {list(subjects.keys())}")

            for subject_name, subject_url in subjects.items():
                exam_ids = await get_exam_ids_from_subject(session, subject_url)
                print(f"  -> [{subject_name}]: Found {len(exam_ids)} exams")

                for exam_id in exam_ids:
                    pdf_url = f"{BASE_DZEXAMS}/data/{exam_id}/{exam_id}.pdf"
                    all_download_tasks.append(
                        download_pdf(session, pdf_url, level, subject_name, exam_id, semaphore)
                    )

        print(f"\nTotal exams queued: {len(all_download_tasks)}")
        await asyncio.gather(*all_download_tasks)
        print("\nAll downloads finished!")

if __name__ == "__main__":
    asyncio.run(main())