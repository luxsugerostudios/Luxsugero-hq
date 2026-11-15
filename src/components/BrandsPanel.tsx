import { useHqContext } from "../lib/hq";
import { BRAND_STATUS_LABEL } from "../lib/labels";

export function BrandsPanel() {
  const { data } = useHqContext();
  const brands = [...data.brands].sort((a, b) => a.order - b.order);

  return (
    <section aria-labelledby="brands-heading">
      <div className="section-head">
        <h2 id="brands-heading">Brand status</h2>
      </div>
      <div className="board">
        {brands.map((brand) => (
          <article key={brand.id} className="brand-card">
            <header>
              <h3>{brand.name}</h3>
              <span className={`pill status-${brand.status}`}>
                {BRAND_STATUS_LABEL[brand.status]}
              </span>
            </header>
            {brand.summary ? <p className="focus">{brand.summary}</p> : null}
            {brand.url ? (
              <p className="meta">
                <a href={brand.url} target="_blank" rel="noreferrer">
                  {brand.url.replace(/^https:\/\//, "")}
                </a>
              </p>
            ) : null}
            <div className="headlines">
              {brand.headlines.map((headline) => (
                <p key={headline.label}>
                  <b>{headline.value}</b>
                  <span>{headline.label}</span>
                </p>
              ))}
            </div>
            {brand.waitingOnFounder.length > 0 ? (
              <>
                <h4>Waiting on founder</h4>
                <ul>
                  {brand.waitingOnFounder.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
