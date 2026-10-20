# Triton Vision Web Server

A web UI for managing and testing an NVIDIA Triton Inference Server, built for the
TritonVision pipeline (YOLO detection models with DALI pre-processing) running on a
Jetson.

It is a fork of [duydvu/triton-inference-server-web-ui](https://github.com/duydvu/triton-inference-server-web-ui).
On top of the original model list, config viewer and metrics, it can:

- manage the model repository on disk (add models, upload model files, edit `config.pbtxt`),
- load and unload models while Triton runs in **poll** mode,
- generate the `<model>_image` ensembles that TritonVision `ConnectImage()` / `DetectImage()` call,
- run a test image through an ensemble and draw the detections in the browser.

This project is not affiliated with NVIDIA.

![Models page](resources/screenshot_models.png)

## Quick start

### Use the lab Jetson

Triton and the web UI are already running, so all you need is a browser.

1. Open **http://140.129.7.180:3000**.
2. Click **Add model**, enter a name (e.g. `model5`), pick the platform and drop the `.onnx`, `.plan` or `.pt` file.
3. Keep **Also create `model5_image`** ticked and click **Create model**.
4. Wait about 5 seconds, until both models show **READY**.
5. Open `model5_image`, go to the **Test** tab and drop a JPEG or PNG to check the detections.
6. From code, call it with TritonVision: `ConnectImage("140.129.7.180:8001", "model5_image")`.

### Set up a new Jetson

Needs JetPack with Docker and the NVIDIA Container Toolkit. Node.js is installed by the script.

```bash
git clone https://github.com/CaptainAAI/TritonWebServer.git ~/triton-inference-server-web-ui && cd ~/triton-inference-server-web-ui && ./deploy/install.sh
```

The script asks for your sudo password, then:

1. installs or updates Node.js to the latest LTS release for ARM64, with the latest npm (from nodejs.org, checksum verified, into `/usr/local`),
2. creates `~/nvidiatriton/model_repository` and `~/nvidiatriton/disabled_models`, and adds the `preprocess` (DALI) model,
3. copies [`deploy/compose.yaml`](deploy/compose.yaml) to `~/nvidiatriton/` and starts Triton with it,
4. writes `.env.local`, installs the dependencies and builds the web UI,
5. installs and starts the `tritonserver` systemd service, so the web UI starts at boot,
6. prints the URL once Triton and the web UI answer.

It is safe to run again, e.g. after a `git pull`: existing models, `compose.yaml` and
`.env.local` are kept. Options, as environment variables:

| Variable | Effect |
|---|---|
| `TRITON_DIR=/path` | Triton folder instead of `~/nvidiatriton` |
| `NODE_VERSION=v24.22.0` | Install this Node.js version instead of the latest LTS |
| `SKIP_NODE=1` | Leave Node.js and npm as they are |

For example: `SKIP_NODE=1 ./deploy/install.sh`.

## Features

**Models page (`/repo`)**
- Every model Triton knows about, with its state, version and the reason it failed to load.
- Total / Ready / Not ready counters that double as filters, plus a search box.
- Refreshes on its own: Triton polls the repository, so new and changed models show up without reloading the page.
- Server status (name, version, ready) in the app bar, and a light/dark mode switch.

**Model page (`/models/<model>/versions/<version>`)**
- Summary cards: platform, max batch size, inference count, average latency, last inference.
- **Overview**: inputs and outputs, instance groups, the files in the version folder, and the pipeline. For an ensemble that is its steps in order; for any other model, the ensembles that call it.
- **Statistics**: count and average time per inference stage, plus Triton's raw statistics. Refreshes on its own.
- **Config**: the `config.pbtxt` on disk, or the config Triton loaded when the repository is not configured.
- **Test** (image ensembles only): drop a JPEG or PNG, adjust the confidence and NMS IoU thresholds, and see the boxes, the Triton time (DALI pre-processing included) and the letterbox values.

Overview of an image ensemble, with its pipeline:

![Ensemble overview](resources/screenshot_ensemble.png)

Test tab, running an image through `model1_image`:

![Detection test](resources/screenshot_test.png)

Statistics tab:

![Model statistics](resources/screenshot_stats.png)

**Add model (`/repo/new`)**
- Templates for ONNX Runtime, TensorRT, PyTorch (TorchScript), Python, DALI and Ensemble.
- Uploads the model file with a progress bar. The file is staged next to the repository and renamed into place, so Triton never sees a half-written file.
- Optionally creates `<name>_image` as well: DALI pre-processing followed by the new model.
- For the Ensemble template, picking a loaded YOLO model fills in the inputs, outputs and steps.

![Add model](resources/screenshot_add.png)

**Per-model actions**
- **Upload / replace model file**: as a new version folder (the old version stays on disk for rollback) or overwriting a file in an existing version.
- **Edit config**: writes `config.pbtxt` on disk in poll mode, or sends the config with a load request in explicit mode.
- **Load / Reload / Unload**: see [Load and unload in poll mode](#load-and-unload-in-poll-mode). Unloading a model that loaded ensembles depend on asks whether to unload those ensembles too.
- **Delete** (red bin icon, also on the model page): deletes the model folder from disk, or only one version when the model has several. It lists the ensembles that call the model, so they can be deleted with it. A model or version whose folder was deleted by hand no longer shows in the list either.

## Deployment on the Jetson

| Component | How it runs | Ports |
|---|---|---|
| Triton 26.08 (`nvcr.io/nvidia/tritonserver:26.08-py3`) | Docker container `triton`, from `~/nvidiatriton/compose.yaml` | HTTP 8000, gRPC 8001, metrics 8002 |
| This web UI | systemd service `tritonserver.service`, which runs `npm start` in this folder | 3000 |

Despite its name, `tritonserver.service` runs the **web UI**, not Triton.

The files for a new setup are in [`deploy/`](deploy/): `compose.yaml`, the `preprocess`
model, the systemd unit template and `install.sh` (see [Quick start](#set-up-a-new-jetson)).

Triton is started with `--model-control-mode=poll --repository-poll-secs=5`, so it picks
up changes in the model repository within about 5 seconds.

Folders on the host:

| Path | What it holds |
|---|---|
| `~/nvidiatriton/model_repository` | The model repository, mounted into the container as `/models` |
| `~/nvidiatriton/disabled_models` | Models unloaded from the web UI (moved out of the repository) |
| `~/nvidiatriton/.webui-uploads` | Temporary files while an upload is in progress |

Open the web UI at `http://<jetson-ip>:3000`.

### Common commands

Deploy a code change (or run `./deploy/install.sh`, which does the same):
```bash
cd ~/triton-inference-server-web-ui
npm ci
npm run build
sudo systemctl restart tritonserver
```

Web UI logs:
```bash
journalctl -u tritonserver -f
```

Triton (the `rectech` user is not in the `docker` group, so use `sudo`):
```bash
cd ~/nvidiatriton
sudo docker compose up -d
sudo docker logs -f triton
```

## Configuration

The settings are read from `.env` and `.env.local` in this folder. `.env.local` takes
precedence over `.env`.

| Variable | Description |
|---|---|
| `API_URL` | Triton HTTP endpoint, e.g. `http://127.0.0.1:8000` |
| `API_AUTH_HEADER` | Optional. Sent as the `Authorization` header to Triton |
| `NEXT_PUBLIC_WEBUI_BASEPATH` | Optional. Serve the UI under a sub-path. Read at **build** time, so rebuild after changing it |
| `MODEL_REPOSITORY_PATH` | Host path of the model repository. Needed for everything that touches files: Add model, uploads, editing `config.pbtxt` on disk, and poll-mode load/unload |
| `MODEL_CONTROL_MODE` | Set to `poll` when Triton runs with `--model-control-mode=poll` |
| `MODEL_DISABLED_PATH` | Optional. Where unloaded models are moved. Defaults to `disabled_models` next to the repository |

Current values on the Jetson:
```bash
# .env (owned by root: edit with sudo)
API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WEBUI_BASEPATH=

# .env.local
MODEL_REPOSITORY_PATH=/home/rectech/nvidiatriton/model_repository
MODEL_CONTROL_MODE=poll
```

`MODEL_REPOSITORY_PATH` is the path on the host, not `/models` inside the container. The
web UI writes to it directly, so it has to run on the same machine as the repository.

## Load and unload in poll mode

In poll mode Triton rejects the load/unload API, so the web UI changes the repository
instead and Triton applies the change on its next poll:

| Action | What the web UI does |
|---|---|
| Unload | Moves `model_repository/<model>` to `disabled_models/<model>`. The model stays in the list as `DISABLED` |
| Load (disabled model) | Moves the folder back into the repository |
| Reload (model in the repository) | Updates the modification time of `config.pbtxt`, so Triton reloads the model |

With `MODEL_CONTROL_MODE` unset, the buttons call Triton's
`/v2/repository/models/<model>/load|unload` API instead (Triton's explicit mode).

## Image ensembles (TritonVision)

```
model_repository/
├── preprocess/      DALI: ENCODED (UINT8 file bytes) -> images FP32 [3, 640, 640] + LETTERBOX FP32 [5]
├── model1/          YOLO model (ONNX, TensorRT or TorchScript)
├── model1_image/    ensemble: IMAGE -> preprocess -> model1 -> output0 + LETTERBOX
└── ...
```

- An image ensemble has one `UINT8` input (the bytes of a JPEG or PNG file) and two outputs: the raw YOLO output and `LETTERBOX` (`scale, pad_x, pad_y, width, height`), which maps the boxes back to the original image.
- The YOLO model must take FP32 `[3, 640, 640]`, which is what `preprocess` produces.
- Post-processing (confidence filter and NMS) runs in the client, or in the web UI server for the Test tab. Two output layouts are supported:
  - `[1, N, 6]` (`x1, y1, x2, y2, score, class`): end-to-end models, NMS already done.
  - `[1, 4 + classes, N]` (`cx, cy, w, h`, then one score per class): NMS is applied per class.

> **Only send JPEG or PNG images.** DALI cannot skip an image it fails to decode: one
> request that is not an image breaks `preprocess` for every later request until it is
> reloaded. The web UI's detect API rejects anything else.

### Adding a YOLO model

1. Open **Add model**, enter a name (e.g. `model4`), pick the platform and the version.
2. Drop the model file (`model.onnx`, `model.plan` or `model.pt`).
3. Check the input and output names and dims in `config.pbtxt` against your model.
4. Keep **Also create `model4_image`** ticked to get the ensemble.
5. Save. Within a few seconds Triton loads both models, and `model4_image` gets a **Test** tab.

### Converting a YOLO model to TensorRT

A TensorRT engine (`model.plan`) runs fastest on the Jetson, but it only works with the
TensorRT version that built it. Build it **inside the `triton` container**, so it always
matches the Triton that runs it.

**1. Export ONNX** from the trained `.pt` (on any PC with `pip install ultralytics`):

```python
from ultralytics import YOLO

model = YOLO("ParticlesDetection_0112.pt")   # your trained model
model.export(format="onnx", imgsz=640)        # writes ParticlesDetection_0112.onnx
```

Do not use `half=True` here. On a GPU it makes the ONNX input FP16, but `preprocess`
produces FP32, so the `_image` ensemble does not work (on a CPU it is ignored). For FP16,
use `--fp16` in step 3 instead: the engine then still takes and returns FP32.

**2. Upload the ONNX** in the web UI: **Add model** → enter a name (e.g. `model5`) →
platform **TensorRT** → drop the `.onnx` file. With TensorRT selected it is saved as
`model5/1/model.onnx`. Set the `output0` dims in `config.pbtxt` to `[ 1, 4 + num_classes, 8400 ]`
(e.g. `[ 1, 6, 8400 ]` for 2 classes), keep **Also create `model5_image`** ticked, and
click **Create model**. The model shows UNAVAILABLE until step 3 is done.

**3. Convert** on the Jetson (SSH):

```bash
sudo docker exec -it triton bash
```

then inside the container (replace `model5` with your model name):

```bash
/usr/src/tensorrt/bin/trtexec --onnx=/models/model5/1/model.onnx --saveEngine=/models/model5/1/model.plan
```

- Building takes a few minutes. Add `--fp16` for a faster, smaller engine.
- At the end trtexec prints the input and output shapes; they must match `config.pbtxt`.
- Type `exit` to leave the container. Within 5 seconds Triton loads `model5` and
  `model5_image` (**READY**). If it stays UNAVAILABLE, click **Reload** in the web UI.
- `model.onnx` may stay in the folder; Triton only loads `model.plan`.

## Manual setup (without install.sh)

These are the steps `install.sh` performs, for setting up by hand or for repairing one
part. Run them on the Jetson as the normal user.

**1. Check Docker and the NVIDIA runtime:**

```bash
docker --version
sudo docker compose version
sudo docker info | grep -i runtimes        # must list "nvidia"
```

**2. Create the folders, clone the web UI and copy the server files:**

```bash
mkdir -p ~/nvidiatriton/model_repository ~/nvidiatriton/disabled_models
git clone https://github.com/CaptainAAI/TritonWebServer.git \
    ~/triton-inference-server-web-ui
cd ~/triton-inference-server-web-ui
cp -r deploy/model_repository/preprocess ~/nvidiatriton/model_repository/
cp deploy/compose.yaml ~/nvidiatriton/
```

**3. Start Triton:**

```bash
cd ~/nvidiatriton
sudo docker compose pull                    # first time: downloads several GB
sudo docker compose up -d
sudo docker ps --filter name=triton         # STATUS must be "Up"
curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/v2/health/live   # 200
```

**4. Node.js** (skip if `node -v` already shows v20.9 or newer; the latest LTS is listed on nodejs.org):

```bash
node -v                                     # needs v20.9 or newer
curl -fsSLO https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-arm64.tar.gz
sudo tar -xzf node-v24.22.0-linux-arm64.tar.gz -C /usr/local --strip-components=1
node -v && npm -v
```

**5. Configure and build the web UI:**

```bash
cd ~/triton-inference-server-web-ui
cat > .env.local <<EOF
API_URL=http://127.0.0.1:8000
MODEL_REPOSITORY_PATH=$HOME/nvidiatriton/model_repository
MODEL_CONTROL_MODE=poll
EOF
npm ci
npm run build
npm start                                   # test, then stop with Ctrl+C
```

**6. Install the web UI as a service** that starts at boot (from the web UI folder):

```bash
sed -e "s|@USER@|$USER|" -e "s|@WORKDIR@|$PWD|" \
    -e "s|@NODE_DIR@|/usr/local/bin|" -e "s|@NPM@|/usr/local/bin/npm|" \
    deploy/tritonserver.service | sudo tee /etc/systemd/system/tritonserver.service
sudo systemctl daemon-reload
sudo systemctl enable --now tritonserver
systemctl status tritonserver
```

> Create `~/nvidiatriton/model_repository` yourself before step 3. If Docker creates it,
> the folder belongs to root and the web UI cannot write to it.

## Logs and status

| Task | Command (on the Jetson) |
|---|---|
| Is the Triton container running? | `sudo docker ps --filter name=triton` |
| Triton log, live | `sudo docker logs -f triton` |
| Triton errors of the last 10 minutes | `sudo docker logs --since 10m triton 2>&1 | grep -iE "error|fail"` |
| Is Triton ready? (200 = every model loaded) | `curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/v2/health/ready` |
| State of every model | `curl -s -X POST localhost:8000/v2/repository/index` |
| Inputs and outputs of one model | `curl -s localhost:8000/v2/models/model1` |
| Open a shell in the container | `sudo docker exec -it triton bash` |
| Restart Triton | `sudo docker restart triton` |
| Is the web UI running? | `systemctl status tritonserver` |
| Web UI log, live | `journalctl -u tritonserver -f` |
| Web UI log of the last 10 minutes | `journalctl -u tritonserver --since "10 min ago"` |
| Restart the web UI | `sudo systemctl restart tritonserver` |

When a model does not load, the Triton log names the reason (e.g. a wrong tensor name or
dims in `config.pbtxt`); the web UI shows the same reason in the Reason column.

## Managing model folders

```
~/nvidiatriton/
├── compose.yaml
├── model_repository/        Triton loads everything in here (mounted as /models)
│   ├── preprocess/
│   │   ├── config.pbtxt
│   │   └── 1/dali.py
│   ├── model1/
│   │   ├── config.pbtxt
│   │   └── 1/model.plan
│   └── model1_image/
│       ├── config.pbtxt
│       └── 1/                (empty, but required)
├── disabled_models/         unloaded models: Triton does not see them
├── .webui-uploads/          upload files while they are being received
└── .webui-trash/            folders the web UI is deleting
```

Every change can be made by hand or in the web UI; Triton applies it within 5 seconds:

| Task | By hand (in ~/nvidiatriton) | Web UI |
|---|---|---|
| Add a model | Create `model_repository/model6/config.pbtxt` and `model6/1/model.plan` | Add model |
| Add a new version | Create `model6/2/` with the new `model.plan` (Triton serves the highest version) | Upload file → new version |
| Unload | `mv model_repository/model6 disabled_models/` | Unload |
| Load again | `mv disabled_models/model6 model_repository/` | Load |
| Reload after a change | `touch model_repository/model6/config.pbtxt` | Reload |
| Delete | `rm -rf model_repository/model6` (`sudo` if it has files owned by root) | Delete |
| Back up | `cp -a ~/nvidiatriton/model_repository ~/backup/model_repository_$(date +%F)` | — |
| Fix ownership | `sudo chown -R $USER:$USER ~/nvidiatriton` | — |

- The folder name must be the same as `name:` in `config.pbtxt`.
- Every model needs at least one version folder (`1/`), the ensembles too.
- By default Triton serves only the highest version number. Delete broken version folders, or Triton keeps reporting them.
- Files created inside the container belong to root (`model.plan` from trtexec, `__pycache__`). The web UI can still delete their folders; by hand, use `sudo rm -rf`.

## Source code guide

Pages run in the browser; files named `route.ts` under `app/api/` run on the Jetson and
are the only parts that talk to Triton or touch the disk:
page or component → `apiFetch("/api/…")` (`api/client.ts`) → `app/api/…/route.ts` →
`api/server.ts` (Triton HTTP API) or `api/repository.ts` (model folders on disk).

**Helpers (`api/`)**

| File | Runs in | What it does |
|---|---|---|
| `api/server.ts` | Server side | fetchServer(): calls the Triton HTTP API at API_URL, with API_AUTH_HEADER. |
| `api/repository.ts` | Server side | Everything that touches the model repository on disk: name and version checks, poll-mode load/unload (move to disabled_models, touch config.pbtxt), delete (move to .webui-trash), the upload staging folder. |
| `api/detect.ts` | Server side | For the Test tab: JPEG/PNG check, building a binary Triton infer request, reading FP32 outputs, YOLO post-processing (port of TritonVision Postprocess). |
| `api/client.ts` | Browser | apiFetch(): calls this app's /api routes and turns errors into messages; uploadModelFile(): upload with a progress bar. |

**HTTP routes (`app/api/`)**

| File | Method | What it does |
|---|---|---|
| `app/api/server/route.ts` | GET /api/server | Triton name, version, ready (app bar status). |
| `app/api/models/route.ts` | POST /api/models | Model list from Triton; adds disabled models and hides versions whose folder is gone. |
| `app/api/models/[model]/versions/[version]/route.ts` | GET | Config and statistics of one model version. |
| `app/api/models/[model]/load/route.ts` | POST | Load or reload (poll mode: move back or touch config.pbtxt). |
| `app/api/models/[model]/unload/route.ts` | POST | Unload (poll mode: move to disabled_models). |
| `app/api/models/[model]/detect/route.ts` | POST | Runs a JPEG/PNG through an image ensemble and returns the detections. |
| `app/api/ensembles/route.ts` | GET | Loaded ensembles and the models each step calls. |
| `app/api/repository/route.ts` | GET | Model folders, versions and files on disk. |
| `app/api/repository/[model]/route.ts` | POST / DELETE | Create a model folder / delete a model folder. |
| `app/api/repository/[model]/config/route.ts` | GET / PUT | Read or replace config.pbtxt. |
| `app/api/repository/[model]/versions/[version]/route.ts` | DELETE | Delete one version folder. |
| `app/api/repository/[model]/versions/[version]/files/[file]/route.ts` | PUT | Upload a file into a version folder (streamed to disk). |

**Pages (`app/`)**

| File | URL | What it does |
|---|---|---|
| `app/layout.tsx` | (every page) | Root layout: fonts, theme, app bar. |
| `app/page.tsx` | / | Redirects to /repo. |
| `app/repo/page.tsx` | /repo | Models page: list, counters, filters, search, refresh every 10 s. |
| `app/repo/new/page.tsx` | /repo/new | Add model: platform templates, file upload, config editor, image ensemble. |
| `app/models/[model]/versions/[version]/page.tsx` | /models/… | Model page: summary, Overview / Statistics / Config / Test tabs, Upload, Unload, Delete. |
| `app/models/[model]/versions/[version]/edit/page.tsx` | …/edit | Edit config: on disk (poll mode) or with a load request (explicit mode). |
| `app/globals.css` |  | Tailwind CSS utilities. |

**Components (`components/`)**

| File | What it does |
|---|---|
| `components/AppBar.tsx` | Top bar: logo, Triton status, Models link, dark mode switch. |
| `components/Providers.tsx` | MUI theme (light and dark colours) and the notification provider. |
| `components/Notify.tsx` | useNotify(): short messages at the bottom of the screen. |
| `components/ModelItem.tsx` | One row of the model list with its buttons. |
| `components/StateChip.tsx` | Coloured state label (READY, UNAVAILABLE, DISABLED…). |
| `components/TableRowsLoader.tsx` | Placeholder rows while the list loads. |
| `components/UnloadDialog.tsx` | useUnload(): unload, warning about ensembles that call the model. |
| `components/DeleteDialog.tsx` | useDelete(): delete a model or one version, optionally with its ensembles. |
| `components/UploadDialog.tsx` | Upload or replace a model file, as a new version or overwriting one. |
| `components/FileDrop.tsx` | Drag-and-drop file picker. |
| `components/EnsembleInfo.tsx` | Pipeline card: the steps of an ensemble, or the ensembles that use a model. |
| `components/DetectTest.tsx` | Test tab: send an image, adjust thresholds, draw the boxes, list the detections. |

**Types, deployment and configuration**

| File | What it does |
|---|---|
| `types/ensemble.ts` | Ensemble types, LETTERBOX, dependentsOf(), isImageEnsemble(), parseModelIO(), imageEnsembleConfig() (writes the <model>_image config). |
| `types/model.ts`, `types/repository.ts` | Types of the model list and of /api/repository; formatBytes(). |
| `deploy/install.sh` | One-command setup (section 4.3). |
| `deploy/compose.yaml` | Triton container definition (section 3.1). |
| `deploy/tritonserver.service` | systemd unit template for the web UI. |
| `deploy/model_repository/preprocess/` | The DALI preprocess model (section 3.2). |
| `package.json` | Dependencies and the scripts `dev`, `build`, `start`, `lint`. |
| `next.config.js` | Base path (NEXT_PUBLIC_WEBUI_BASEPATH) and standalone output. |
| `.env`, `.env.local` | Settings (section 4.4). |
| `tsconfig.json`, `postcss.config.js`, `.eslintrc.json` | TypeScript (the @/ import alias), Tailwind and lint settings. |
| `Dockerfile` | Builds the web UI as a container image (not used on the Jetson). |
| `public/logo.png` | Logo in the app bar. |

## HTTP API

The web UI's own routes, under `/api` (behind `NEXT_PUBLIC_WEBUI_BASEPATH` if set):

| Method | Route | Description |
|---|---|---|
| GET | `/api/server` | Triton name, version and readiness |
| POST | `/api/models` | Repository index from Triton, plus disabled models in poll mode |
| GET | `/api/models/<model>/versions/<version>` | Config and statistics of a model version |
| POST | `/api/models/<model>/load` | Load or reload a model (see poll mode above) |
| POST | `/api/models/<model>/unload` | Unload a model |
| POST | `/api/models/<model>/detect?conf=0.25&iou=0.45` | Body: a JPEG/PNG file. Runs it through an image ensemble and returns the detections, the letterbox and the inference time |
| GET | `/api/ensembles` | Loaded ensembles and their steps |
| GET | `/api/repository` | Model folders, versions and files on disk |
| POST | `/api/repository/<model>` | Create a model folder. JSON body (optional): `{ "config": "...", "version": "1" }` |
| DELETE | `/api/repository/<model>` | Delete a model folder (from the repository or `disabled_models`) |
| DELETE | `/api/repository/<model>/versions/<version>` | Delete one version folder (not the last one) |
| GET / PUT | `/api/repository/<model>/config` | Read or replace `config.pbtxt` (plain text) |
| PUT | `/api/repository/<model>/versions/<version>/files/<file>` | Upload a file into a version folder (raw bytes) |

Example:
```bash
curl -X POST --data-binary @bus.jpg "http://<jetson-ip>:3000/api/models/model1_image/detect?conf=0.25"
```

## Development

Requires Node.js 20.9 or newer (Next.js 16). `deploy/install.sh` keeps the Jetson on the latest LTS.

```bash
git clone https://github.com/CaptainAAI/TritonWebServer.git
cd TritonWebServer
npm install
npm run dev
```

Create `.env` / `.env.local` as described in [Configuration](#configuration). Without
`MODEL_REPOSITORY_PATH` the UI still lists models, shows their configs and statistics, and
runs the Test tab, but cannot change the repository.

Production build:
```bash
npm run build
npm start
```

Stack: Next.js 16 (App Router), React 19, MUI 9, Tailwind CSS 4, TypeScript.

## License

MIT License. Based on [triton-inference-server-web-ui](https://github.com/duydvu/triton-inference-server-web-ui) by duydvu.
