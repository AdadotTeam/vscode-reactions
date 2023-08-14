(function () {
    // @ts-ignore
    // const vscode = acquireVsCodeApi();


    // selecting the elements for which we want to add a tooltip
    const containers = document.querySelectorAll(".tooltip-container");


    // change display to 'block' on mouseover
    for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const targets = container.querySelectorAll(".tooltip-button");
        const target = targets[0];
        const tooltips = container.querySelectorAll(".tooltip-text");
        const tooltip = tooltips[0];

        if(target && tooltip){

            target.addEventListener('mouseover', () => {
                // @ts-ignore
                tooltip.style.display = 'block';
            }, false);

            target.addEventListener('mouseleave', () => {
                // @ts-ignore
            tooltip.style.display = 'none';
            }, false);
        }
    }


}());

