import React from "react";
import { contentEnum } from "../index";

const Sidebar = (props) => {
  return (
    <div className="sidebar">
      <ul>
        <li>
          <button
            onClick={() => props.onChangeContentTo(contentEnum.destinations)}
            type="button"
            className="button -secondary -small -square"
          >
            some icon
            <span className="button__content u-s-pl-xs">Destinations</span>
          </button>
        </li>
        <li>
          <button
            onClick={() => props.onChangeContentTo(contentEnum.generalInfo)}
            type="button"
            className="button -secondary -small -square"
          >
          some icon
            <span className="button__content u-s-pl-xs">General Info</span>
          </button>
        </li>
        <li>
          <button
            onClick={() => props.onChangeContentTo(contentEnum.localFiles)}
            type="button"
            className="button -secondary -small -square"
          >
          some icon
            <span className="button__content u-s-pl-xs">Local Files</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
