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
        pass
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
        pass
    return findings

backend_data = parse_backend()
frontend_data = parse_frontend()

with open('report.md', 'w', encoding='utf-8') as out:
    out.write('# Dead Code Analysis Report\n\n')
    out.write('This report summarizes the dead code instances found in the backend and frontend.\n\n')
    
    out.write('## Backend Dead Code\n\n')
    out.write(f'**Total Files:** {len(backend_data)}  \n')
    out.write(f'**Total Instances:** {sum(len(v) for v in backend_data.values())}\n\n')
    
    out.write('| File Path | Dead Code Count |\n')
    out.write('|-----------|-----------------|\n')
    for f, items in sorted(backend_data.items(), key=lambda x: len(x[1]), reverse=True):
        out.write(f'| {f} | {len(items)} |\n')
        
    out.write('\n## Frontend Dead Code\n\n')
    out.write(f'**Total Files:** {len(frontend_data)}  \n')
    out.write(f'**Total Instances:** {sum(len(v) for v in frontend_data.values())}\n\n')
    
    out.write('| File Path | Dead Code Count |\n')
    out.write('|-----------|-----------------|\n')
    for f, items in sorted(frontend_data.items(), key=lambda x: len(x[1]), reverse=True):
        out.write(f'| {f} | {len(items)} |\n')
