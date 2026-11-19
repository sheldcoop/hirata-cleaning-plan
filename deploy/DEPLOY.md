# Hosting on ProKube (Knative)

The app is static files, so the container is just a small web server (nginx, port 8080).
**The data stays on the shared drive:** on each PC, people connect the shared `data` folder once,
exactly as today. Nothing about the plan file changes, and opening the app from the share still works.

## 1. Build and push the image (needs Docker and Harbor access)

```
docker build -t HARBOR_HOST/PROJECT/hirata-cleaning-plan:0.8.0 .
docker login HARBOR_HOST
docker push HARBOR_HOST/PROJECT/hirata-cleaning-plan:0.8.0
```
Use the version from `js/config.js` as the tag, and a new tag for every update.

## 2. Deploy in ProKube

Serverless → Knative Services → Deploy New Knative Service:
- **Service name:** `hirata-cleaning-plan`
- **Container image:** `HARBOR_HOST/PROJECT/hirata-cleaning-plan:0.8.0`
- **Container port:** `8080`
- **Scaling:** min 1 (always ready) or min 0 (sleeps, first open takes a few seconds)
- **Resources:** CPU 50m / memory 32Mi request is plenty
- No environment variables needed.

Or use the YAML tab with `deploy/knative-service.yaml`. If the Harbor project is private, the namespace
needs an image pull secret (ask the ProKube team) and the `imagePullSecrets` lines.

## 3. First use

Open the service URL in Edge or Chrome → **Connect data folder** → choose the shared `data` folder.
Each PC does this once per browser. Bookmark the URL instead of the `.cmd` launcher.

## 4. Update

Build and push a new tag, then edit the service and change the image tag (Knative rolls it out).

## Check with the ProKube team

- Can colleagues without a ProKube account open the service URL? (operators need it)
- Is the URL HTTPS? (Edge only allows the data-folder access on HTTPS or from a file)
- Image pull secret name for Harbor, if the project is private.
