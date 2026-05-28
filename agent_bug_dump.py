import argparse
import json
import os
import hashlib

DUMP_FILE = "agent_bugs.json"

def get_hash(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def load_bugs():
    if os.path.exists(DUMP_FILE):
        with open(DUMP_FILE, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []

def save_bugs(bugs):
    with open(DUMP_FILE, "w", encoding="utf-8") as f:
        json.dump(bugs, f, indent=4)

def log_bug(title, description, file_path, severity):
    bugs = load_bugs()
    
    title_norm = title.lower().strip()
    file_norm = file_path.lower().strip() if file_path else ""
    
    # Check for duplicates based on title and file
    for bug in bugs:
        existing_title = bug['title'].lower().strip()
        existing_file = bug['file_path'].lower().strip() if bug.get('file_path') else ""
        
        if existing_title == title_norm and existing_file == file_norm:
            print(f"Duplicate rejected: Exact match found for '{title}' in '{file_path}'.")
            return
            
        # If it's the exact same file and the titles are somewhat similar (one is substring of another)
        if existing_file == file_norm and file_norm != "":
            if title_norm in existing_title or existing_title in title_norm:
                print(f"Duplicate rejected: Similar bug already logged for this file: '{bug['title']}'.")
                return

    new_bug = {
        "id": get_hash(f"{title_norm}_{file_norm}_{len(bugs)}")[:8],
        "title": title,
        "description": description,
        "file_path": file_path,
        "severity": severity,
        "status": "open"
    }
    
    bugs.append(new_bug)
    save_bugs(bugs)
    print(f"Bug logged successfully! ID: {new_bug['id']}. Total bugs: {len(bugs)}")

def list_bugs():
    bugs = load_bugs()
    if not bugs:
        print("No bugs logged yet.")
        return
        
    print(f"--- Logged Bugs ({len(bugs)}) ---")
    for b in bugs:
        print(f"[{b['id']}] {b.get('severity', 'medium').upper()} | {b['title']}")
        if b.get('file_path'):
            print(f"  File: {b['file_path']}")
        print(f"  Desc: {b['description']}\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Agent Bug Dump - Log and check suspicious bugs to avoid duplicates.")
    parser.add_argument("--log", action="store_true", help="Log a new bug")
    parser.add_argument("--list", action="store_true", help="List all logged bugs")
    parser.add_argument("--title", help="Short title of the bug")
    parser.add_argument("--description", help="Detailed description")
    parser.add_argument("--file", default="", help="File path where the bug was found")
    parser.add_argument("--severity", default="medium", choices=["low", "medium", "high", "critical"], help="Severity of the bug")
    
    args = parser.parse_args()
    
    if args.list:
        list_bugs()
    elif args.log:
        if not args.title or not args.description:
            print("Error: --title and --description are required when logging a bug.")
        else:
            log_bug(args.title, args.description, args.file, args.severity)
    else:
        parser.print_help()
