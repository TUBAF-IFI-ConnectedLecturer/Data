import { FC } from "react";
import { BsInfoCircle } from "react-icons/bs";

import Panel from "./Panel";

const DescriptionPanel: FC = () => {
  return (
    <Panel
      initiallyDeployed
      title={
        <>
          <BsInfoCircle className="text-muted" /> Beschreibung
        </>
      }
    >
      <p>
        Diese Karte zeigt das <i>Netzwerk</i> aller OER-Inhalte des sächsischen OPAL-System.
        Jeder {" "}
        <i>Knoten</i> stellt einen OER-Inhalt dar und jede Kante eine Ähnlichkeitsbeziehung zwischen den Beiträgen {" "}
        .
      </p>

    </Panel>
  );
};

export default DescriptionPanel;
