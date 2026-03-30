import styles from "./IphoneFrame.module.css";

interface IPhoneFrameProps {
  children: React.ReactNode;
  boxShadow?: string;
  width?: number;
}

const chassisColor = "#1C1C1E";

const IPhoneFrame: React.FC<IPhoneFrameProps> = ({
  children,
  boxShadow,
  width = 342,
}) => {
  const fontSize = width / 342;

  const sideBoxShadow = [
    `inset 0 0 1em 1em #000000`,
    "0em 0em 1em 2em rgba(250,247,242,1) inset",
    "0em 0em 1em 2em rgba(250,247,242,1) inset",
    `0em 0em 1em 5em rgba(28,28,30,0.8) inset`,
    boxShadow,
  ]
    .filter(Boolean)
    .join(",");

  const buttonBoxShadow = [
    `inset 0 0 1em 0.5em #000000`,
    "0em 0em 3em 2em rgba(250,247,242,0.4) inset",
  ].join(",");

  return (
    <div className={styles.root} style={{ fontSize: `${fontSize}px` }}>
      <div className={styles.side} style={{ boxShadow: sideBoxShadow }}>
        <div className={styles.screen}>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
      <div className={styles.line} />
      <div className={styles.header}>
        <div className={styles["sensor-1"]} />
        <div className={styles["sensor-2"]} />
      </div>
      <div
        className={styles["volume-button"]}
        style={{ boxShadow: buttonBoxShadow }}
      >
        <div style={{ boxShadow: buttonBoxShadow }}></div>
        <div style={{ boxShadow: buttonBoxShadow }}></div>
      </div>
      <div
        className={styles["power-button"]}
        style={{ boxShadow: buttonBoxShadow }}
      />
    </div>
  );
};

export default IPhoneFrame;
