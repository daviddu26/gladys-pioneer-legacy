# Pioneer Legacy

Cette intégration pilote depuis Gladys les **anciens amplis Pioneer**
(environ 2009 à 2015 : VSX-5xx à VSX-11xx, SC, SC-LX, et les Elite de la même
époque). Ils utilisent le protocole de contrôle IP historique de Pioneer, sur
le **port 8102** (ou 23 sur certains modèles). Les Pioneer récents (2016 et
après) parlent le protocole Onkyo : utilisez l'intégration Onkyo pour eux.

Tout reste **local** : Gladys parle directement à l'ampli sur votre réseau,
sans compte ni cloud.

## Avant de commencer

1. Branchez l'ampli au réseau.
2. Activez **Network Standby** dans le menu de l'ampli. Sans lui, l'ampli
   coupe le réseau en veille : Gladys ne peut plus l'allumer.
3. Donnez-lui de préférence une **IP fixe** (réservation DHCP).

## Ajouter un ampli

1. Ouvrez l'onglet **Découverte** et cliquez sur **Scanner**. Gladys cherche
   les amplis Pioneer de votre réseau (UPnP), vérifie qu'ils répondent au
   protocole, et détecte ce que chacun sait faire.
2. Ajoutez le ou les amplis trouvés. Un modèle qui a une **zone 2** ou une
   **zone 3** apparaît avec un appareil par zone.

Votre ampli n'apparaît pas ? Il est peut-être sur un autre réseau (VLAN) ou
son UPnP est désactivé. Saisissez son adresse IP dans **Adresses des amplis**
(plusieurs séparées par des virgules), enregistrez, puis relancez le scan. Le
bouton **Vérifier une adresse IP** indique tout de suite si une adresse
correspond à un ampli compatible.

Même ajouté par son IP, un ampli garde son identité si son adresse change : il
est reconnu par son identifiant UPnP quand il en a un.

## Configuration

- **Adresses des amplis** : seulement pour les amplis que le scan ne trouve
  pas.
- **Volume maximum (dB)** : Gladys ne monte jamais le volume au-dessus, quel
  que soit le curseur, le bouton ou la scène. 0 dB par défaut.
- **Noms des entrées** : la plupart des modèles ne savent pas donner les noms
  de leurs entrées. Renommez-les avec des paires `code=nom`, par exemple
  `25=Apple TV, 05=TV`. Les modèles qui donnent leurs noms les affichent
  d'eux-mêmes.

## Ce que vous obtenez

Pour chaque zone :

- **Alimentation** (marche / veille)
- **Volume** en dB, **Volume +** et **Volume −** (pas de 1 dB), **Sourdine**
- **Entrée** : la liste des entrées

Pour la zone principale, en plus :

- **Mode d'écoute** : les groupes de modes de la télécommande (Auto
  surround, Auto/Direct, Stéréo, Standard, Advanced). Un groupe rappelle son
  dernier mode utilisé ; renvoyé à moins de 2 secondes d'intervalle, il passe
  au mode suivant, comme la télécommande.
- **Mode d'écoute actuel** (texte), sur les modèles qui savent l'indiquer.

Les changements faits à la télécommande ou en façade apparaissent dans Gladys
immédiatement : l'ampli les annonce de lui-même.

## Boutons de configuration

- **Vérifier une adresse IP** : modèle, port et fonctions détectés.
- **Tester les connexions** : l'état de chaque ampli ajouté.
- **Envoyer une commande** : n'importe quelle commande du protocole Pioneer,
  avec la réponse de l'ampli. Exemples : `?P` (alimentation), `?V` (volume),
  `25FN` (entrée 25), `0112SR` (EXTENDED STEREO en direct, sur les modèles qui
  l'acceptent).

## Scènes

L'action **Envoyer une commande Pioneer** envoie une commande brute à l'ampli
choisi. La réponse de l'ampli est disponible pour les actions suivantes.

## Commandes utilisées

Les codes viennent des fiches officielles Pioneer « AVR IP & RS-232 ».

| Fonction           | Zone principale | Zone 2          | Zone 3          |
| ------------------ | --------------- | --------------- | --------------- |
| Allumer / veille   | `PO` / `PF`     | `APO` / `APF`   | `BPO` / `BPF`   |
| État alimentation  | `?P` → `PWRx`   | `?AP` → `APRx`  | `?BP` → `BPRx`  |
| Volume + / −       | `VU` / `VD`     | `ZU` / `ZD`     | `YU` / `YD`     |
| État volume        | `?V` → `VOLxxx` | `?ZV` → `ZVxx`  | `?YV` → `YVxx`  |
| Sourdine on / off  | `MO` / `MF`     | `Z2MO` / `Z2MF` | `Z3MO` / `Z3MF` |
| Choisir une entrée | `xxFN`          | `xxZS`          | `xxZT`          |
| État entrée        | `?F` → `FNxx`   | `?ZS` → `Z2Fxx` | `?ZT` → `Z3Fxx` |

Une commande inconnue ne renvoie aucune erreur, juste un silence.

## Dépannage

| Problème                           | Piste                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| Le scan ne trouve pas l'ampli      | Saisissez son IP dans **Adresses des amplis**.                |
| « Ampli récent (protocole Onkyo) » | Utilisez l'intégration Onkyo.                                 |
| « Injoignable »                    | Network Standby activé ? Port 8102 ouvert entre vos réseaux ? |
| Le volume ne monte plus            | Il a atteint le **Volume maximum** de la configuration.       |
| Le mode Advanced n'est pas le bon  | Il rappelle le dernier mode Advanced : réglez-le une fois.    |

Pour plus de détail, passez `LOG_LEVEL=debug` : les logs montrent chaque ligne
échangée avec l'ampli.
