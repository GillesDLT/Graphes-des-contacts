# Installer et publier le graphe des contacts

Ce guide couvre la distribution. Le README et la licence restent à ajouter par
l'auteur avant publication.

## 1. Garder une copie sur ton ordinateur

1. Télécharger l'archive ZIP fournie, puis choisir **Extraire tout** dans Windows.
2. Ranger le dossier, par exemple dans `Documents\Graphe-des-contacts`.
3. Ouvrir `index.html` avec Edge, Chrome ou Firefox. Garder tous les fichiers
   JavaScript et CSS à côté du fichier HTML, sans les renommer.

L'application fonctionne localement sans installation, serveur, compilation
ou dépendances externes. La copie d'image vers le presse-papier et la pipette
écran dépendent des permissions et des API du navigateur ; les exports PNG/SVG
restent disponibles.

**Avant de déplacer l'application ou de passer à la version en ligne**, enregistrer
les graphes importants avec **Enregistrer (.json)**. L'enregistrement automatique
est local au navigateur et à l'emplacement de la page : il ne se transfère pas
automatiquement vers un nouveau dossier ou vers GitHub Pages. Réouvrir les fichiers
JSON avec **Ouvrir** dans la nouvelle copie. Les images de référence sont temporaires
et doivent être réimportées.

Le ZIP contient l'outil, pas tes documents de travail ni les images temporaires.
Ne pas travailler directement à l'intérieur du ZIP.

## 2. Préparer les fichiers à publier

La racine du dépôt doit contenir `index.html`, `style.css` et tous les fichiers
`.js` de l'application.

Les fichiers complémentaires fournis sont :

- `.gitignore` : ignore les archives, les exports, les dossiers `documents/`,
  les réglages locaux et les fichiers de secrets courants.
- `.gitattributes` : harmonise les fins de ligne des fichiers texte.
- `.editorconfig` : définit l'indentation et l'encodage pour l'éditeur.
- `.nojekyll` : indique qu'il s'agit d'un site statique.
- `.github/workflows/pages.yml` : publie le site avec GitHub Pages.

Ajouter ton `README.md` et ton fichier de licence avant de rendre le dépôt public.
Vérifier que tu as le droit de publier le code et les éventuelles images ajoutées.

**Ne pas publier** de graphes confidentiels, d'images de travail, de clés ou de
données personnelles. `.gitignore` est une aide, pas une vérification automatique :
les fichiers déjà suivis par Git ou envoyés via le navigateur ne sont pas protégés
par ces règles. Vérifier la liste des fichiers avant chaque envoi.

## 3. Publier le code sur GitHub sans installer Git

1. Se connecter à [GitHub](https://github.com/) et créer un dépôt, par exemple
   `graphe-des-contacts`.
2. Pour la voie décrite ici, choisir **Public**. Ne pas ajouter un autre README
   ou une autre licence si tu as déjà préparé les tiens.
3. Utiliser **uploading an existing file** dans le dépôt vide, ou
   **Add file > Upload files**.
4. Envoyer les fichiers de la racine, le dossier `.github` avec son sous-dossier
   `workflows`, et les fichiers de configuration commençant par un point.
   Envoyer aussi ton README et ta licence. Ne pas envoyer le ZIP.
5. Vérifier l'arborescence : `index.html` doit être à la racine du dépôt, et le
   workflow doit se trouver à `.github/workflows/pages.yml`.
6. Valider l'envoi sur une branche appelée **main**, puis contrôler la liste des
   fichiers dans GitHub. Cette opération publie le code ; l'étape suivante active
   la page web.

Si la branche porte un autre nom, renommer la branche en `main`, ou adapter la
liste `branches` dans le workflow.

## 4. Activer le site avec GitHub Pages

1. Dans le dépôt, ouvrir **Settings > Pages**.
2. Sous **Build and deployment**, choisir **Source: GitHub Actions**.
3. Ouvrir **Actions > Publish GitHub Pages > Run workflow**, sur la branche `main`.
4. Attendre la réussite du déploiement. Le lien du site est affiché dans
   **Settings > Pages** et dans l'environnement `github-pages`.

L'adresse habituelle est :

```text
https://TON-PSEUDO.github.io/graphe-des-contacts/
```

Le workflow publie uniquement les fichiers HTML, CSS et JavaScript de la racine,
avec `.nojekyll`. Il ne publie pas les dossiers de documents, les ZIP ou les
réglages de l'éditeur. À chaque nouvel envoi sur `main`, le site est mis à jour.
Si le premier déploiement échoue avant l'activation de Pages, relancer le workflow
après avoir choisi **GitHub Actions** dans les réglages.

Ouvrir le site, créer une pièce et exporter un graphe pour vérifier la publication.
Le site est une application côté navigateur : les graphes restent enregistrés
localement, pas dans ton dépôt GitHub. Partager un graphe nécessite son fichier JSON.

## 5. Variante avec Git pour les prochaines mises à jour

Git n'était pas disponible dans l'environnement au moment de préparer cette
livraison. Pour gérer les versions en ligne de commande, installer
[Git pour Windows](https://git-scm.com/download/win), puis ouvrir PowerShell
dans le dossier extrait.

Pour un dépôt GitHub **vide**, après avoir ajouté le README et la licence :

```powershell
git init -b main
git config user.name "Ton nom"
git config user.email "Ton adresse Git ou ton adresse GitHub noreply"
git add .
git status
git diff --cached --stat
git commit -m "Initial version of contact graph editor"
git remote add origin https://github.com/TON-PSEUDO/graphe-des-contacts.git
git push -u origin main
```

Remplacer les valeurs d'exemple. Vérifier les fichiers proposés par `git status`
avant de créer le commit. L'authentification est prise en charge par Git Credential
Manager ; ne pas écrire de jeton dans les fichiers ni dans l'adresse du dépôt.

Si tu as déjà publié via le navigateur, **cloner le dépôt existant** dans un nouveau
dossier avec `git clone`, puis y copier tes modifications, au lieu de créer une
deuxième histoire avec `git init`.

Pour envoyer une mise à jour depuis le dépôt local :

```powershell
git add .
git diff --cached --stat
git commit -m "Update contact graph editor"
git push
```

## 6. Proposer un téléchargement dans GitHub

Le bouton **Code > Download ZIP** permet déjà de télécharger les sources.
Pour distribuer une version identifiée :

1. Créer une version dans **Releases > Draft a new release**, avec un tag tel que
   `v1.0.0`.
2. Décrire les changements et, si souhaité, joindre un ZIP vérifié contenant
   l'application, le README et la licence, sans documents de travail.
3. Publier la release.

Le ZIP fourni dans cette session ne contient pas encore ton README ni ta licence.
Recréer l'archive avant une distribution publique si tu souhaites les y inclure.
