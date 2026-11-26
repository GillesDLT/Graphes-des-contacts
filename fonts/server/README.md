# Serveur de partage — Graphe des contacts

Ce petit serveur (un seul fichier Node.js) permet à plusieurs personnes
d'ouvrir **le même graphe en même temps** : les modifications de chacun
apparaissent chez les autres en quelques centaines de millisecondes, avec le
nom, la couleur et le curseur de chaque participant.

Il sert aussi l'application elle-même, ce qui est pratique pour un essai en
réseau local ou derrière un tunnel.

```
server/
  graph-server.js   le serveur (HTTP + WebSocket + SQLite)
  package.json      une seule dépendance : ws
  data/boards.sqlite  créé automatiquement, contient les graphes partagés
```

## 1. Démarrage rapide

```bash
cd server
npm install
npm start            # écoute sur http://0.0.0.0:8787
```

Puis, dans `collab.config.js` à la racine du dépôt :

```js
window.GRAPHE_COLLAB = { server: 'http://192.168.1.41:8787' };
```

Ouvrir l'application, puis dans **Projets** cliquer sur **Partager** et **Créer le lien de partage**.
Le lien ressemble à `…/index.html#/b/hXUfSNym` : toute personne qui l'ouvre voit
et modifie le même graphe.

L'adresse du serveur peut aussi être saisie directement dans la fenêtre
**Partager** (elle est alors mémorisée dans le navigateur et prend le pas sur
`collab.config.js`).

### Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8787` | port d'écoute |
| `HOST` | `0.0.0.0` | interface d'écoute |
| `DATA_DIR` | `server/data` | dossier de la base SQLite |

## 2. Mise en service permanente (systemd)

Copier `graphe-serveur.service.example`, ajuster les chemins et l'utilisateur,
puis :

```bash
sudo cp graphe-serveur.service.example /etc/systemd/system/graphe-serveur.service
sudo systemctl daemon-reload
sudo systemctl enable --now graphe-serveur
systemctl status graphe-serveur
```

Sauvegarde : le fichier `data/boards.sqlite` suffit. Une copie quotidienne
(`sqlite3 boards.sqlite ".backup"`) protège l'essentiel.

## 3. Accès depuis Internet

Deux contraintes à respecter :

1. **HTTPS obligatoire** si l'application est servie par GitHub Pages : une page
   `https://` ne peut pas appeler un serveur `http://` (contenu mixte bloqué par
   le navigateur). Il faut donc un certificat, ou un tunnel qui s'en occupe.
2. Le WebSocket doit passer par le même domaine que l'API.

### Option A — Cloudflare Tunnel (gratuit, pas d'ouverture de port)

```bash
cloudflared tunnel login
cloudflared tunnel create graphe
cloudflared tunnel route dns graphe graphe.mondomaine.fr
cloudflared tunnel run --url http://127.0.0.1:8787 graphe
```

Le tunnel expose `https://graphe.mondomaine.fr` et gère les WebSockets.
Dans `collab.config.js` :

```js
window.GRAPHE_COLLAB = { server: 'https://graphe.mondomaine.fr' };
```

### Option B — proxy inverse classique (nginx + Let's Encrypt)

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### Option C — réseau local seulement

Rien à exposer : `server: 'http://192.168.1.41:8787'` fonctionne pour les
personnes connectées au même réseau (salle de cours, atelier).

## 4. Modèle de partage et sécurité

- **Toute personne qui possède le lien peut modifier le graphe.** C'est un
  tableau blanc partagé, pas un espace privé : ne pas diffuser un lien hors du
  groupe concerné, et ne pas mettre de données confidentielles dans un board
  partagé.
- Une clé de propriétaire (`key`) est remise au créateur du board. Elle ne sert
  qu'à **renommer** le board depuis le serveur et à le **supprimer**
  (`DELETE /api/boards/<id>`). Elle est conservée dans le navigateur du
  créateur ; sans elle, le board reste accessible mais ne peut pas être
  supprimé à distance.
- Aucune authentification, aucun compte, aucun cookie : le serveur ne stocke
  que l'identifiant du board et son contenu JSON.
- Aucune URL publique ne permet de **lister** les boards existants.
- Si le serveur est arrêté, l'application continue de fonctionner localement :
  le participant retrouve sa copie et reprend la synchronisation au retour du
  serveur (les modifications faites hors ligne sont rejouées).

## 5. API (utile pour un script ou un diagnostic)

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/boards` `{name, doc}` | crée un board, renvoie `{id, key}` |
| `GET` | `/api/boards/<id>` | contenu du board |
| `PATCH` | `/api/boards/<id>` `{name}` | renomme |
| `DELETE` | `/api/boards/<id>` `{key}` | supprime (clé du créateur) |
| `POST` | `/api/boards/lookup` `{keys:[…]}` | métadonnées des boards dont on a la clé |
| `GET` | `/api/health` | état du serveur |
| `WS` | `/ws?board=<id>&cid=<client>&name=<nom>&color=<couleur>` | synchronisation |

## 6. Limites connues

- Un seul processus Node suffit largement pour une promotion d'étudiants ; il
  n'y a pas de répartition de charge.
- Le document complet transite à la connexion (pas d'historique incrémental) :
  au-delà de quelques mégaoctets de graphe, la première ouverture devient lente.
- Sur un même champ, la dernière écriture reçue gagne ; deux personnes qui
  déplacent **la même pièce** en même temps verront la position de la dernière
  action, pas une fusion des deux.
- L'historique **Annuler** reste local : annuler chez soi n'annule pas l'action
  d'un autre, et les modifications des autres sont conservées dans les états
  sauvegardés par votre historique.
