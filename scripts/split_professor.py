import re
import os

source_file = "backend/app/routers/professor.py"
service_file = "backend/app/services/professor_services.py"

with open(source_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

router_start_idx = 0
for i, line in enumerate(lines):
    if line.startswith("@router."):
        router_start_idx = i
        break

# The router is defined at line 71: `router = APIRouter(tags=["Professor"])`
# The first route is somewhere below.
# Let's find the first @router.
first_route_idx = next(i for i, line in enumerate(lines) if line.startswith("@router."))

# The functions are between the router definition and the first route.
# We want to extract all def _... functions.

import ast
with open(source_file, "r", encoding="utf-8") as f:
    source_code = f.read()

tree = ast.parse(source_code)

functions_to_extract = []
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name.startswith("_") or node.name in ["publish_chat_message_change"]:
            functions_to_extract.append(node)

# This is getting complicated to do safely via AST.
