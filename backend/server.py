# Emergent-preview shim ONLY. The real backend is the Node/Express app in ./src.
# It boots scripts/preview-start.sh (PostgreSQL + Node API on :4000) and reverse-proxies /api to it.
# Not used when you run the project yourself (`yarn dev` in /backend).
import os, socket, subprocess
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response

NODE = "http://127.0.0.1:4000"
app = FastAPI()
client = httpx.AsyncClient(base_url=NODE, timeout=60)


def _listening(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


@app.on_event("startup")
async def boot():
    if not _listening(4000):
        log = open("/var/log/supervisor/node-api.log", "a")
        subprocess.Popen(["bash", os.path.join(os.path.dirname(__file__), "../scripts/preview-start.sh")],
                         stdout=log, stderr=log, start_new_session=True)


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(path: str, request: Request):
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    try:
        r = await client.request(request.method, "/" + path, params=request.query_params,
                                 headers=headers, content=await request.body())
    except httpx.ConnectError:
        return Response('{"success":false,"error":{"code":"STARTING","message":"API is starting"}}',
                        status_code=503, media_type="application/json")
    excluded = ("content-encoding", "transfer-encoding", "connection", "content-length")
    return Response(r.content, status_code=r.status_code,
                    headers={k: v for k, v in r.headers.items() if k.lower() not in excluded})
