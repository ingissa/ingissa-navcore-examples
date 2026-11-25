# NavCore Navigation POC

> **Exemple principal officiel** du SDK NavCore **2.1.0** — Application Expo / React Native démontrant un pipeline de navigation complet avec MapLibre et routage Valhalla local.
>
> [English version (README.md)](./README.md)

Ce dossier est l'intégration officielle du POC dans `ingissa-navcore-examples`. Il constitue un **exemple vivant maintenu avec le SDK**, et non une démonstration statique.

---

## Ce que démontre ce POC

| Fonctionnalité | Détail |
|---|---|
| **Navigation bout en bout** | Valhalla local → NavCore → rendu MapLibre |
| **Déviation depuis la position courante** | Bouton `"Simulate deviation here"` — sans reset de route |
| **Confirmation OFF_ROUTE** | FSM NavCore : fenêtre de 2 secondes basée sur les timestamps GPS |
| **Rerouting Valhalla** | Recalcul depuis la position exacte hors-corridor vers la destination d'origine |
| **Visualisation du corridor** | Route, corridor, trace GPS brute, trace snappée, trajectoire de déviation |
| **HUD diagnostique** | 10 métriques en temps réel, panneau repliable, états FSM live |
| **Asset véhicule** | Symbole PNG avec bearing NavCore, positionné sur la coordonnée snappée |
| **GPS foreground** | Permission et tracking réel sur device |
| **Replay de scénarios** | Fixtures JSON de scénarios de navigation reproductibles |

> [!IMPORTANT]
> Ce POC démontre le comportement déterministe V2 clé : une sortie persistante du corridor fait évoluer l'état de `DEVIATING` vers `OFF_ROUTE` en utilisant les **timestamps GPS** (et non la vitesse de rendu React). Cela garantit un comportement déterministe indépendant des performances du device.

---

## Architecture du pipeline

```text
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
| `@ingissa/navcore-core` | `^2.1.0` | Moteur de navigation, FSM, corridor |
| `@ingissa/navcore-react-native` | `^2.1.0` | Hooks React Native, `useNavCore`, sélecteurs |
| `@ingissa/navcore-simulator` | `^2.1.0` | Générateur de trajectoires de déviation |

---

## Prérequis

- Node.js 20+
- `npx expo` (Expo CLI)
- Émulateur Android ou device physique Android avec Expo Dev Client
- Serveur Valhalla local (voir [Directions Providers](../../docs/directions-providers.md)) ou mode fixture
- Clé de licence NavCore Suite pour les modules Pro en production (voir [Licensing & Offline Verification](../../docs/licensing.md))

---

## Installation

```bash
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

> [!NOTE]
> `EXPO_PUBLIC_NAVCORE_DEV_MODE=true` (`isDev: true`) déverrouille les modules Pro **uniquement en développement**. En build de production (`globalThis.__DEV__ === false` ou `NODE_ENV === 'production'`), `isDev` est ignoré et une clé Suite liée à `applicationId` est requise.

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

---

## Modes de replay

| Variable d'env | Valeur | Effet |
|---|---|---|
| `EXPO_PUBLIC_ROUTE_MODE` | `fixture` | Utilise les fixtures JSON au lieu de Valhalla |
| `EXPO_PUBLIC_NAVCORE_REPLAY_DIAGNOSTICS` | `true` | Logs détaillés de replay |
| `EXPO_PUBLIC_NAVCORE_CAPTURED_REPLAY` | `true` | Rejoue une trace capturée de wrong-turn |

---

## Limitations connues

- Android uniquement (iOS non testé)
- Pas de localisation en arrière-plan
- Les tuiles OpenFreeMap nécessitent une connexion internet (Valhalla peut être 100 % local)
- Pas de guidage vocal en production
- Pas de cartes hors-ligne
- La révocation de licence hors-ligne n'est pas instantanée (limitation inhérente au modèle de vérification locale)
