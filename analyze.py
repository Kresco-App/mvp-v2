import re
from collections import defaultdict

def parse_backend():
    findings = defaultdict(list)
    try:
        with open('backend_dead_code.txt', 'r', encoding='utf-16le') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                match = re.match(r'^(.*?):(\d+): (.*?)(?:\s+\(\d+%\s+confidence\))?$', line)
                if match:
                    file_path, line_num, message = match.groups()
                    findings[file_path].append((line_num, message))
    except Exception as e:
        print(f"Error backend: {e}")
    return findings

def parse_frontend():
    findings = defaultdict(list)
    try:
        with open('frontend_dead_code.txt', 'r', encoding='utf-16le') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                match = re.match(r'^(.*?):(\d+)\s+-\s+(.*)$', line)
                if match:
                    file_path, line_num, message = match.groups()
                    findings[file_path].append((line_num, message))
    except Exception as e:
        print(f"Error frontend: {e}")
    return findings

backend_data = parse_backend()
frontend_data = parse_frontend()

print(f"Backend Files with dead code: {len(backend_data)}")
print(f"Frontend Files with dead code: {len(frontend_data)}")

backend_total = sum(len(v) for v in backend_data.values())
frontend_total = sum(len(v) for v in frontend_data.values())

print(f"Backend Total dead code entries: {backend_total}")
print(f"Frontend Total dead code entries: {frontend_total}")

# Top 10 backend files with most dead code
print("\nTop 10 Backend files with most dead code:")
for f, items in sorted(backend_data.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
    print(f"  {f}: {len(items)} items")

# Top 10 frontend files with most dead code
print("\nTop 10 Frontend files with most dead code:")
for f, items in sorted(frontend_data.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
    print(f"  {f}: {len(items)} items")
