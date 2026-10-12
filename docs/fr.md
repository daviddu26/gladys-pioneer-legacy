# Pioneer Legacy

Cette intégration pilote depuis Gladys les **anciens amplis Pioneer**
(environ 2010 à 2015 : VSX-528, VSX-529, VSX-921, VSX-1021, VSX-824…), qui
utilisent le protocole de contrôle IP historique de Pioneer sur le **port
8102**. Ces modèles ne parlent pas le protocole Onkyo (eISCP, port 60128) des
Pioneer récents : l'intégration Onkyo ne les voit donc pas.

Tout reste **local** : Gladys parle directement à l'ampli sur votre réseau,
sans compte ni cloud.

## Avant de commencer

1. Branchez l'ampli au réseau (câble Ethernet).
2. Activez **Network Standby** dans le menu de l'ampli. Sans lui, l'ampli
   coupe le réseau en veille : Gladys ne peut plus l'allumer.
3. Donnez-lui une **IP fixe** (réservation DHCP dans votre box ou routeur).
4. Vérifiez que la machine qui fait tourner Gladys peut joindre l'ampli sur le
   port 8102 (attention aux règles de pare-feu entre VLAN).

## Configuration

- **Adresse IP de l'ampli** : obligatoire.
- **Port** : 8102 par défaut (quelques modèles utilisent 23).
- **Volume maximum (dB)** : Gladys ne monte jamais le volume au-dessus, quel
  que soit le curseur, le bouton ou la scène. 0 dB par défaut.
- **Noms des entrées** : l'ampli ne sait pas donner les noms de ses entrées
  par le réseau. Renommez-les avec des paires `code=nom`, par exemple
  `25=Apple TV, 05=TV`.

Enregistrez, puis ajoutez l'ampli depuis l'onglet **Découverte**.

## Ce que vous obtenez

- **Alimentation** (marche / veille)
- **Volume** en dB, **Volume +** et **Volume −** (pas de 1 dB), **Sourdine**
- **Entrée** : la liste des entrées (codes Pioneer, renommables)
- **Mode d'écoute** : _Auto surround_, ou _Advanced_, qui rappelle le dernier
  mode utilisé du groupe Advanced (par exemple EXT.STEREO). L'ampli ne sait
  pas indiquer son mode d'écoute : Gladys affiche le dernier mode demandé.

Les changements faits à la télécommande ou en façade apparaissent dans Gladys
immédiatement : l'ampli les annonce de lui-même.

## Boutons de configuration

- **Tester la connexion** : modèle, alimentation, volume et entrée actuels.
- **Envoyer une commande** : n'importe quelle commande du protocole Pioneer,
  avec la réponse de l'ampli. Exemples : `?P` (alimentation), `?V` (volume),
  `25FN` (entrée 25), `0100SR` (groupe Advanced).

## Scènes

L'action **Envoyer une commande Pioneer** envoie une commande brute. La
réponse de l'ampli est disponible pour les actions suivantes. Exemple :
envoyer `0100SR` plusieurs fois à moins de 2 secondes d'intervalle fait
défiler les modes Advanced, comme la télécommande.

## Commandes validées sur un VSX-528

| Fonction           | Commande  | Réponse         |
| ------------------ | --------- | --------------- |
| Allumer / veille   | `PO`/`PF` | `PWR0` / `PWR2` |
| Volume + / −       | `VU`/`VD` | `VOLxxx`        |
| Sourdine on / off  | `MO`/`MF` | `MUT0` / `MUT1` |
| Choisir une entrée | `xxFN`    | `FNxx`          |
| Auto surround      | `0006SR`  | (aucune)        |
| Groupe Advanced    | `0100SR`  | (aucune)        |

Une commande inconnue ne renvoie aucune erreur, juste un silence.

## Dépannage

| Problème                            | Piste                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| « Ampli injoignable »               | Network Standby activé ? IP correcte ? Port 8102 ouvert ?                          |
| Injoignable dès qu'il est en veille | Activez Network Standby.                                                           |
| Le volume ne monte plus             | Il a atteint le **Volume maximum** de la configuration.                            |
| Mode Advanced « faux »              | `0100SR` rappelle le dernier mode Advanced : réglez-le une fois à la télécommande. |

Pour plus de détail, passez `LOG_LEVEL=debug` : les logs montrent chaque ligne
échangée avec l'ampli.
