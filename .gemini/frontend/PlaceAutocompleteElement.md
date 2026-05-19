This example adds an Autocomplete widget to a web page, and displays the results for each selected place.

```
async function init(): Promise<void> {
    // Request needed libraries.
    // @ts-expect-error - when this gets addressed also remove the global eslint-disables above
    const { PlaceAutocompleteElement } =
        await google.maps.importLibrary('places');
    // Create the input HTML element, and append it.
    const placeAutocomplete = new PlaceAutocompleteElement();
    document.body.appendChild(placeAutocomplete);

    // Inject HTML UI.
    const selectedPlaceTitle = document.createElement('p');
    selectedPlaceTitle.textContent = '';
    document.body.appendChild(selectedPlaceTitle);

    const selectedPlaceInfo = document.createElement('pre');
    selectedPlaceInfo.textContent = '';
    document.body.appendChild(selectedPlaceInfo);

    // Add the gmp-select listener, and display the results.
    placeAutocomplete.addEventListener(
        'gmp-select',
        async ({
            placePrediction,
        }: google.maps.places.PlacePredictionSelectEvent) => {
            const place = placePrediction.toPlace();
            await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location'],
            });
            selectedPlaceTitle.textContent = 'Selected Place:';
            selectedPlaceInfo.textContent = JSON.stringify(
                place.toJSON(),
                /* replacer */ null,
                /* space */ 2
            );
        }
    );
}

void init();
```

Restrict place search to map bounds

```
// Use the bounds_changed event to restrict results to the current map bounds.
google.maps.event.addListener(innerMap, 'bounds_changed', async () => {
    placeAutocomplete.locationRestriction = innerMap.getBounds();
});
```

Bias place search results

```
placeAutocomplete.locationBias = {radius: 100, center: {lat: 40.749933, lng: -73.98633}};
```

Restrict place search results to certain types
```
const autocomplete = new google.maps.places.PlaceAutocompleteElement({
  includedPrimaryTypes: ['establishment'],
});
```