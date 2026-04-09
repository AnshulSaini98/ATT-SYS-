import React from "react";

const Loading = React.memo(({ label = "Loading..." }) => (
  <div className="loading-row">
    <span className="loading-dot" aria-hidden="true" />
    <span>{label}</span>
  </div>
));

export default Loading;
