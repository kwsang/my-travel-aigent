import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileModal from './ProfileModal';

// 1. Mock external configuration and dependencies
jest.mock('@/config/constants', () => ({
  API_CONFIG: { BASE_URL: 'http://localhost:8000' },
  PROFILE_OPTIONS: {
    TRAVEL_INTERESTS: ['History', 'Nature'],
    RISK_TOLERANCES: [{ value: 'relaxed', label: 'Relaxed' }],
    CIRCADIAN_PREFERENCES: [{ value: 'night_owl', label: 'Night Owl' }],
    TRANSPORT_OPTIONS: [{ value: 'public', label: 'Public' }]
  }
}));

// 2. Mock the Google Maps wrapper so it renders safely in the JSDOM test environment
jest.mock('./LocationAutocomplete', () => {
  return function MockLocationAutocomplete({ value, onChange }: any) {
    return (
      <input 
        data-testid="location-input" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
      />
    );
  };
});

describe('ProfileModal Saving Process', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should navigate through all pages, capture the location, and save successfully', async () => {
    // Mock a successful backend response
    const mockResponse = {
      party_size: 2,
      budget: { total_limit: 1500, currency: 'USD' },
      preferences: {
        starting_location: 'Atlanta, GA',
        start_date: '2026-10-01',
        end_date: '2026-10-07'
      }
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(
      <ProfileModal 
        sessionId="test-session" 
        userId="test-user-123" 
        onClose={mockOnClose} 
        onSave={mockOnSave} 
      />
    );

    // Page 1: Verify we are on step 1, then advance
    expect(screen.getByText(/Party Size/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Page 2: Type in the Starting Location, then advance
    expect(screen.getByText(/Starting Location/i)).toBeInTheDocument();
    const locationInput = screen.getByTestId('location-input');
    fireEvent.change(locationInput, { target: { value: 'Atlanta, GA' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Page 3: Verify we are on step 3, then Save
    expect(screen.getByText(/Start Date/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save Profile/i }));

    // Assertions: Ensure the fetch call contained the nested location data
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/profile/test-user-123',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"starting_location":"Atlanta, GA"')
      })
    );

    // Verify callbacks triggered
    expect(mockOnSave).toHaveBeenCalledWith(mockResponse);
    expect(mockOnClose).toHaveBeenCalled();
  });
});