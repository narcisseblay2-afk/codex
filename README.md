# Atelier

Un espace personnel en français pour organiser ses projets, déposer des fichiers ou dossiers et conserver ses consignes. Interface adaptée aux téléphones. Il s'agit d'un espace partagé sous un seul mot de passe, pas d'une application multi-utilisateur.

## Développement

Node.js 22 ou supérieur.

```sh
npm ci
npm test
npm start
```

Le serveur écoute sur le port 3000 de la machine locale. Les données sont conservées dans `.data/` (ignoré par Git). `DATA_DIR` permet de choisir un autre répertoire. Sauvegarder ce répertoire pour conserver fichiers et messages. `HOST`, `PORT` et `APP_PASSWORD` sont configurables ; un mot de passe est obligatoire si le serveur écoute sur une interface publique. Chaque tâche cloud est déjà isolée : utiliser ce checkout, sans créer de worktree.

## Déploiement Vercel

1. Envoyer ce projet dans votre dépôt GitHub, puis l'importer dans Vercel. Choisir le preset « Other ». Le fichier `vercel.json` configure les fichiers statiques et l'API Node. Utiliser Node 22 ou 24.
2. Dans le Marketplace / Storage du projet Vercel, créer une base **Neon Postgres** et la connecter au projet. Vérifier la présence de `DATABASE_URL` dans les variables du projet.
3. Créer un stockage **Vercel Blob privé**, le connecter au projet et vérifier la présence de `BLOB_READ_WRITE_TOKEN`. Le mode privé est nécessaire pour les documents de travail.
4. Ajouter `APP_PASSWORD` avec un mot de passe long et unique dans les variables Vercel. Ne pas le mettre dans Git ni dans un message. Configurer les variables pour l'environnement de déploiement choisi (Production, et Preview si utilisé).
5. Déployer ou redéployer après la connexion des stockages. Vercel fournit une adresse HTTPS en `.vercel.app` ; un domaine personnel est facultatif.
6. Vérifier sur cette adresse : connexion, création d'un projet, import d'un fichier, téléchargement, ajout d'un message. Redéployer puis vérifier que le projet, son message et son fichier sont toujours présents.

Les tables sont créées au premier démarrage ; l'utilisateur Postgres doit pouvoir créer la table `atelier_projects`. Les messages et métadonnées sont stockés dans Postgres, les documents dans Blob. Les ajouts SQL sont atomiques pour conserver les modifications simultanées. Les sessions signées durent 24 heures et ne dépendent pas de la mémoire d'une fonction. Changer le mot de passe invalide les sessions.

La version Vercel limite chaque fichier à **4 Mo** pour respecter la limite des requêtes et réponses des fonctions. La version locale accepte 25 Mo. L'import d'un dossier conserve le chemin relatif de chaque fichier ; les dossiers vides ne sont pas importés. Pour de gros documents, il faudra ajouter l'import direct signé vers Blob et le téléchargement en flux avant de relever cette limite.

## Discussion avec un assistant

Le carnet conserve les messages. Pour activer l'assistant, ajouter `OPENAI_API_KEY` dans les variables secrètes de Vercel, puis redéployer. La clé reste côté serveur. `OPENAI_MODEL` est facultatif (défaut : `gpt-5-mini`). Les appels utilisent l'API Responses et peuvent entraîner des frais selon votre compte OpenAI.

Après activation, chaque message transmet les 20 derniers messages du projet et ses documents texte ou PDF admissibles à OpenAI. Le texte est limité à 100 000 caractères par document, avec un budget de 4 Mo de documents par requête. Les autres formats ne sont pas lus. L'interface signale cette transmission. Les réponses sont conservées dans le projet. Une erreur de quota, de clé ou un délai dépassé laisse le message utilisateur enregistré et affiche un avertissement.

L'assistant propose des analyses et corrections ; il ne modifie pas les fichiers originaux. Il n'a pas accès à votre session ChatGPT. La connexion réelle à OpenAI nécessite votre clé et reste à valider après activation.

## Vérifications

`npm test` exerce la protection par mot de passe, création d'un projet, import et téléchargement avec vérification du contenu, messages, refus d'une origine externe, validation des entrées et persistance après redémarrage, avec un stockage local temporaire.

Le parcours Chromium a aussi été vérifié sur ordinateur et téléphone : création, import, message et rechargement. Les services Neon et Blob doivent encore être validés dans votre compte Vercel ; les tests locaux ne prouvent pas la connexion à ces services.

Le stockage local est destiné à un seul processus. En production, utiliser les stockages Vercel prévus ci-dessus et configurer leurs sauvegardes selon vos besoins.
