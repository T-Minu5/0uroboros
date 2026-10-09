---
kind: concept
category: effects
aliases: [Servers group, Drain, Repair, Destroy your backup]
is_a: "[[Effect step]]"
related: ["[[Server]]", "[[Victory Points]]"]
tags: [ontology/effects]
---
# Server effects

Targets: **Available** (Primary, then Backup once it falls), **Both**, **Backup**.

| Effect | Action id | Does | Printed |
| --- | --- | --- | --- |
| Drain | `damageServer` | Damage; destroying an enemy Server scores destruction VP | -200 Enemy server · -200 Both enemy servers |
| Repair | `repairServer` | Heal, never above max; a destroyed Server can't be repaired | Repair +100 · Repair backup server +100 |
| Destroy your backup | `destroyServer` | Set your Backup to 0; no VP | Destroy your backup server |
