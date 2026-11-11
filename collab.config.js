'use strict';
/* =====================================================================
   collab.config.js — adresse du serveur de partage en direct
   ---------------------------------------------------------------------
   Laisser vide désactive le partage (l'application reste pleinement
   utilisable en local, avec plusieurs projets dans le navigateur).

   Exemples :
     window.GRAPHE_COLLAB = { server: 'https://graphe.exemple.fr' };
     window.GRAPHE_COLLAB = { server: 'http://192.168.1.41:8787' };   // réseau local

   Cette valeur peut aussi être saisie dans 🔗 Partager (elle est alors
   mémorisée dans le navigateur et prend le pas sur ce fichier).
   ===================================================================== */
window.GRAPHE_COLLAB = {
  server: ''
};
