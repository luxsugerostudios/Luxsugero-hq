import { formatStamp } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import { KRAYA_BRANDS, KRAYA_LABEL } from "../lib/pipeline";

export function PipelinePanel() {
  const { data } = useHqContext();

  return (
    <section aria-labelledby="pipeline-heading">
      <div className="section-head">
        <h2 id="pipeline-heading">Sales pipeline</h2>
        <p className="meta">Skybox and F&H stage counts, synced from Kraya. This page does not call Kraya.</p>
      </div>
      {KRAYA_BRANDS.map((id) => {
        const board = data.pipelines.find((item) => item.id === id) ?? null;
        return (
          <div key={id} className="group">
            <h3 className="kicker">{KRAYA_LABEL[id]}</h3>
            {!board ? <p className="empty">Waiting for Kraya sync</p> : null}
            {board ? (
              <>
                <p className="meta">
                  Synced from Kraya {board.syncedAt ? formatStamp(board.syncedAt) : "—"}
                  {board.account ? ` · ${board.account}` : ""}
                  {` · ${board.total} in the funnel`}
                </p>
                <div className="kanban">
                  {board.stages.map((stage) => (
                    <article key={stage.name} className="person">
                      <header>
                        <h3>{stage.name}</h3>
                        <p className="meta">{stage.count}</p>
                      </header>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
