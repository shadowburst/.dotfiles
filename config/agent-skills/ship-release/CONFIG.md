# ClickUp space config

`.clickup.json` at a repository's root caches the static ClickUp setup of the space the repository delivers to, so the skills skip lookups that cost rate-limited MCP calls. Every repository of the space carries the same file.

```json
{
  "space_id": "90120000000",
  "lists": { "roadmap": "901200000001", "deliveries": "901200000003" },
  "fields": {
    "release_note": "<Note de version field ID>",
    "deploy_actions": "<Actions de déploiement field ID>",
    "preprod_delivery": "<Livraison préprod field ID>",
    "prod_delivery": "<Livraison prod field ID>",
    "environment": "<Environnement field ID>",
    "deploy_checklist": "<Checklist de déploiement field ID>",
    "deployed_by": "<Déployé par field ID>"
  },
  "environment_options": { "preprod": "<Préprod option ID>", "prod": "<Production option ID>" },
  "task_types": { "bug": 1005, "hotfix": 1006 },
  "statuses": {
    "roadmap": {
      "review": "en revue",
      "ready_for_preprod": "pour mise en preprod",
      "in_preprod": "test preprod",
      "ready_for_prod": "pour mise en prod",
      "in_prod": "en prod",
      "done": ["en prod", "à facturer", "terminé"]
    },
    "deliveries": {
      "prepared": "préparée",
      "deploying": "en cours",
      "deployed": "déployée",
      "verified": "vérifiée",
      "cancelled": "annulée"
    }
  },
  "repos": [
    { "repo": "Owner/app", "branches": { "integration": "dev", "preprod": "staging", "prod": "main" } },
    { "repo": "Owner/app-worker", "branches": { "integration": "dev", "preprod": "staging", "prod": "main" } }
  ]
}
```

- `lists.deliveries` is the 🚀 Livraisons list; `lists.roadmap` is the 🗓️ Roadmap list.
- Relation field IDs differ from space to space; the other fields can be shared.
- `task_types` are the workspace task type IDs of 🐞 Retour bug and 🔥 Hotfix; every other type is a feature.
- `statuses.roadmap.done` lists the statuses a task never leaves for an earlier one.
- `branches.integration` receives feature PRs, `branches.preprod` deploys préprod, `branches.prod` deploys prod.

## Build or refresh

Build the file when it is missing; refresh only the part a ClickUp call rejects (an unknown field, option, or status) and report what changed.

1. `clickup_get_workspace_hierarchy` for the space: the Roadmap and Livraisons list IDs.
2. `clickup_get_custom_fields` for each list: field IDs by name, and the Environnement option IDs.
3. `clickup_get_list` for each list: status names, mapped to the roles above.
4. `clickup_execute_operator` `task_type.list`: the Retour bug and Hotfix IDs.
5. Ask the user for the space's repositories and branches when the current repository cannot tell them.

Write the file, then ask the user to commit it to every repository of the space.
