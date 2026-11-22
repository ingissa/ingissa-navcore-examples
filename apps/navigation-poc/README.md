# NavCore Navigation POC

> **Exemple principal officiel** du SDK Navcore 2.0.0 — Application Expo / React Native démontrant un pipeline de navigation complet avec MapLibre et routage Valhalla local.

Ce dossier est l'intégration officielle du POC dans le dépôt d'exemples Navcore. Il constitue un **exemple vivant maintenu avec le SDK**, et non une démonstration statique ou une capture d'écran.

---

## Ce que démontre ce POC

| Fonctionnalité | Détail |
|---|---|
| **Navigation bout en bout** | Valhalla local → NavCore → rendu MapLibre |
| **Déviation depuis la position courante** | Bouton "Simulate deviation here" — sans reset de route |
| **Confirmation OFF_ROUTE** | FSM NavCore : fenêtre de 2 secondes basée sur les timestamps GPS |
| **Rerouting Valhalla** | Recalcul depuis la position exacte hors-corridor vers la destination d'origine |
| **Visualisation du corridor** | Route, corridor, trace GPS brute, trace snappée, trajectoire de déviation |
| **HUD diagnostique** | 10 métriques en temps réel, collapsible, états FSM live |
| **Asset véhicule** | Symbole PNG avec bearing NavCore, positionné sur la coordonnée snappée |
| **GPS foreground** | Permission et tracking réel sur device |
| **Replay de scénarios** | Fixtures JSON de scénarios de navigation reproductibles |

> [!IMPORTANT]
> Ce POC démontre la correction V2 clé : une sortie persistante du corridor fait évoluer l'état de `DEVIATING` vers `OFF_ROUTE` en utilisant les **timestamps GPS** (et non la vitesse de rendu React). Cela garantit un comportement déterministe indépendant des performances du device.

---

## Architecture du pipeline

```
GPS fix
  → filtrage / bearing
  → snapping vers la géométrie de route
  → corridor dynamique
  → OffRouteFSM (DEVIATING → OFF_ROUTE après 2 s GPS)
  → progression / instructions / état public
  → rendu MapLibre + rerouting Valhalla
```

### Packages SDK utilisés

| Package | Version | Rôle |
|---|---|---|
| `@ingissa/navcore-core` | `^2.0.0` | Moteur de navigation, FSM, corridor |
| `@ingissa/navcore-react-native` | `^2.0.0` | Hooks React Native, `useNavCore`, sélecteurs |
| `@ingissa/navcore-simulator` | `^2.0.0` | Générateur de trajectoires de déviation |

---

## Prérequis

- Node.js 20+
- `npx expo` (Expo CLI)
- Emulateur Android ou device physique Android avec Expo Dev Client
- Serveur Valhalla local (voir [docs/local-valhalla.md](../../docs/local-valhalla.md))
- Une licence Navcore Suite valide (voir [docs/license-setup.md](../../docs/license-setup.md))

---

## Installation

```bash
# Depuis la racine du dépôt ingissa-navcore-examples
cd apps/navigation-poc
npm install
```

---

## Configuration

```bash
cp .env.example .env
```

Éditer `.env` :

```env
APP_VARIANT=development
EXPO_PUBLIC_ROUTE_MODE=valhalla
EXPO_PUBLIC_VALHALLA_URL=http://10.0.2.2:8002
EXPO_PUBLIC_NAVCORE_LICENSE_KEY=<votre-token-de-licence>
EXPO_PUBLIC_NAVCORE_APPLICATION_ID=com.udereva.app
EXPO_PUBLIC_NAVCORE_DEV_MODE=false
```

> [!NOTE]
> `10.0.2.2` est l'adresse de l'hôte depuis un émulateur Android. Sur device physique, utiliser l'IP locale de la machine hébergeant Valhalla.

> [!NOTE]
> `EXPO_PUBLIC_ROUTE_MODE=fixture` permet de tester sans serveur Valhalla en utilisant les fixtures JSON embarquées.

---

## Lancement

```bash
# Dev server
npx expo start --dev-client

# Build Android direct
npx expo run:android
```

---

## États de navigation (HUD)

| Label HUD | Signification |
|---|---|
| `ON ROUTE` | Véhicule dans le corridor, navigation active |
| `APPROACHING ROUTE` | Session démarrée, déplacement vers le début de route |
| `DEVIATION · CONFIRMING FOR 2 s` | Hors corridor — FSM NavCore accumule le temps GPS |
| `OFF ROUTE · CONFIRMED` | 2 s écoulées hors corridor — rerouting déclenché |
| `RECALCULATING · REQUESTED` | Requête Valhalla dispatchée |
| `RECALCULATING · RECEIVED` | Valhalla a répondu, nouvelle route en cours d'application |
| `RECALCULATING · RESUMING` | Nouvelle route chargée, navigation repart |

---

## Scénario de déviation (démonstration principale)

1. Lancer une session de navigation (GPS réel ou point sur la carte)
2. Attendre l'état `ON ROUTE`
3. Appuyer sur **"Simulate deviation here"** — déclenche une trajectoire GPS simulée de 10 s / 51 points depuis la position courante
4. Observer `DEVIATION · CONFIRMING FOR 2 s` — NavCore chronomètre la sortie du corridor
5. Après ~2 secondes, `OFF ROUTE · CONFIRMED` apparaît et le rerouting commence
6. La trajectoire rose pointillée représente le chemin simulé ; la trace rouge marque la déviation confirmée

> [!NOTE]
> La trajectoire simulée est **clairement identifiée visuellement** (rose pointillée). Le comportement GPS réel est distinct du mode simulation.

---

## Modes de replay

| Variable d'env | Valeur | Effet |
|---|---|---|
| `EXPO_PUBLIC_ROUTE_MODE` | `fixture` | Utilise les fixtures JSON au lieu de Valhalla |
| `EXPO_PUBLIC_NAVCORE_REPLAY_DIAGNOSTICS` | `true` | Logs détaillés de replay |
| `EXPO_PUBLIC_NAVCORE_CAPTURED_REPLAY` | `true` | Rejoue une trace capturée de wrong-turn |

---

## Structure du code

```
apps/navigation-poc/
├── App.tsx                          # Composant racine, orchestration complète
├── app.json / app.config.js         # Config Expo
├── metro.config.js                  # Config Metro (consommateur npm pur)
├── tsconfig.json                    # TypeScript strict
├── index.ts                         # Point d'entrée Expo
├── .env.example                     # Variables d'environnement documentées
├── assets/                          # Icônes app, sprite véhicule
├── plugins/
│   └── withAndroidCleartextTraffic.js  # Plugin Expo (HTTP local dev uniquement)
├── src/
│   ├── components/
│   │   └── GuidanceMap.tsx          # Carte MapLibre + overlays
│   ├── location/
│   │   ├── locationSample.ts        # Typage des samples GPS
│   │   └── useForegroundLocation.ts # Hook GPS foreground
│   ├── navigation/
│   │   ├── atomicSessionStart.ts    # Démarrage atomique de session
│   │   ├── freshReroute.ts          # Rerouting depuis position courante
│   │   ├── licenseRuntimeDiagnostics.ts
│   │   ├── navigationViewModel.ts   # ViewModel états/HUD
│   │   ├── rerouteAttemptCoordinator.ts
│   │   ├── timestampedReplay.ts     # Replay avec timestamps GPS réels
│   │   ├── types.ts                 # Types internes
│   │   ├── useNavigationSession.ts  # Hook session de navigation
│   │   ├── useReplaySource.ts       # Source GPS : réel ou replay
│   │   ├── useRerouteOnOffRoute.ts  # Déclencheur de rerouting
│   │   ├── wrongTurnReplay.ts       # Scénario wrong-turn
│   │   └── fixtures/
│   │       └── capturedWrongTurnReplay.ts
│   └── routing/
│       ├── routeMetrics.ts          # Progression, distance
│       ├── valhallaAdapter.ts       # Adaptation route Valhalla → NavCore
│       ├── valhallaClient.ts        # Client HTTP Valhalla
│       └── valhallaFixture.ts       # Fixture statique Valhalla
└── tests/
    └── fixtures/
        └── navigation/
            └── key-mode-fixtures.json  # Scénarios GPS reproductibles
```

---

## Limitations connues

- Android uniquement (iOS non testé)
- Pas de localisation en arrière-plan
- Tiles OpenFreeMap nécessitent une connexion internet (Valhalla peut être 100% local)
- Pas de guidage vocal en production
- Pas de cartes hors-ligne
- La révocation de licence hors-ligne n'est pas instantanée (limitation inhérente au modèle de vérification locale)

---

## Relation avec le POC source

Ce dossier est l'intégration officielle du POC originel situé à `navigation-poc/mobile/`.
Le POC originel conserve son historique Git, ses scripts de test avancés et sa documentation de recherche.
Cet exemple dans `ingissa-navcore-examples` est la version maintenue, alignée sur le SDK 2.0.0 publié.

Les scripts de test avancés (key-matrix, replay diagnostics, license probes) restent dans le repo POC originel et ne sont pas inclus ici pour maintenir la simplicité de l'exemple.
